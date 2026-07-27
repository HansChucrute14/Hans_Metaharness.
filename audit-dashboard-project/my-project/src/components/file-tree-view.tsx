'use client'

import { useState, useMemo, useCallback, type ReactNode } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card'
import {
  Badge,
} from '@/components/ui/badge'
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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Folder, FolderOpen, FileCode, FileJson, FileText, File as FileIcon,
  ChevronRight, Search, Expand, ChevronsDownUp,
  FileWarning, AlertCircle, FolderTree, Hash, Flame,
  Bookmark, BookmarkCheck,
} from 'lucide-react'
import type { Finding, Severity, AuditStatus } from '@/lib/audit-types'
import {
  severityConfig, auditStatusConfig, AUDIT_STATUS_ORDER,
} from '@/lib/audit-data'

/* ─── Props ─── */
interface FileTreeViewProps {
  findings: Finding[]
  onNavigateToFinding: (finding: Finding) => void
  bookmarks: Set<string | number>
  onToggleBookmark: (task: string | number) => void
  findingStatuses: Record<string, 'not-started' | 'in-progress' | 'fixed' | 'wont-fix'>
  onStatusChange: (task: string | number, status: string) => void
}

/* ─── Types ─── */
interface TreeNode {
  name: string
  path: string
  type: 'dir' | 'file'
  findings: Finding[]
  children: TreeNode[]
  allFindings: Finding[]
}

type SortOption = 'name' | 'count' | 'severity'

/* ─── Constants ─── */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
}

const SEVERITY_DOT_CLASS: Record<Severity, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-slate-400',
}

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low']

/* ─── Tree Building ─── */
function buildTree(findings: Finding[]): TreeNode {
  const root: TreeNode = {
    name: 'root', path: '', type: 'dir',
    findings: [], children: [], allFindings: [],
  }
  const dirMap = new Map<string, TreeNode>()
  dirMap.set('', root)

  function getOrCreateDir(path: string, name: string): TreeNode {
    const existing = dirMap.get(path)
    if (existing) return existing
    const node: TreeNode = {
      name, path, type: 'dir', findings: [], children: [], allFindings: [],
    }
    dirMap.set(path, node)
    const parentPath = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''
    const parentName = parentPath.includes('/')
      ? parentPath.substring(parentPath.lastIndexOf('/') + 1)
      : parentPath
    const parent = getOrCreateDir(parentPath, parentName)
    parent.children.push(node)
    return node
  }

  function getOrCreateFile(path: string, name: string, parentPath: string): TreeNode {
    const parentName = parentPath.includes('/')
      ? parentPath.substring(parentPath.lastIndexOf('/') + 1)
      : parentPath
    const parent = getOrCreateDir(parentPath, parentName)
    const existing = parent.children.find(c => c.path === path && c.type === 'file')
    if (existing) return existing
    const node: TreeNode = {
      name, path, type: 'file', findings: [], children: [], allFindings: [],
    }
    parent.children.push(node)
    return node
  }

  for (const finding of findings) {
    for (const rawPath of finding.affectedFiles) {
      const hasTrailing = rawPath.endsWith('/')
      const cleanPath = hasTrailing ? rawPath.slice(0, -1) : rawPath
      const segments = cleanPath.split('/').filter(Boolean)
      if (segments.length === 0) continue
      const lastName = segments[segments.length - 1]
      const fullPath = segments.join('/')
      const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : ''
      let node: TreeNode
      if (hasTrailing) {
        node = getOrCreateDir(fullPath, lastName)
      } else {
        node = getOrCreateFile(fullPath, lastName, parentPath)
      }
      if (!node.findings.some(f => f.task === finding.task)) {
        node.findings.push(finding)
      }
    }
  }

  function aggregate(node: TreeNode): Finding[] {
    if (node.type === 'file') {
      node.allFindings = [...node.findings]
      return node.allFindings
    }
    const set = new Set<Finding>()
    node.findings.forEach(f => set.add(f))
    node.children.forEach(c => aggregate(c).forEach(f => set.add(f)))
    node.allFindings = Array.from(set)
    return node.allFindings
  }
  aggregate(root)
  return root
}

function sortTree(node: TreeNode, sortOption: SortOption) {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    if (sortOption === 'name') {
      return a.name.localeCompare(b.name)
    }
    if (sortOption === 'count') {
      return b.allFindings.length - a.allFindings.length || a.name.localeCompare(b.name)
    }
    // severity: max severity wins, then count
    const aMax = a.allFindings.reduce((m, f) => Math.max(m, SEVERITY_WEIGHT[f.severity]), 0)
    const bMax = b.allFindings.reduce((m, f) => Math.max(m, SEVERITY_WEIGHT[f.severity]), 0)
    if (aMax !== bMax) return bMax - aMax
    return b.allFindings.length - a.allFindings.length || a.name.localeCompare(b.name)
  })
  node.children.forEach(c => sortTree(c, sortOption))
}

/* Prune tree based on search query.
 * - File/dir name match → include node with all its findings (for context)
 * - Finding title/task match → include node with only the matching findings
 * - Non-matching dir with matching descendants → include, but only matching branch
 */
function filterTree(node: TreeNode, query: string): TreeNode | null {
  if (!query.trim()) return node
  const q = query.toLowerCase()
  const nameMatches = node.name.toLowerCase().includes(q)
  const matchingDirectFindings = node.findings.filter(f =>
    f.title.toLowerCase().includes(q) || String(f.task).toLowerCase().includes(q)
  )
  const filteredChildren = node.children
    .map(c => filterTree(c, query))
    .filter((c): c is TreeNode => c !== null)

  if (node.path === '') {
    return { ...node, children: filteredChildren }
  }
  if (nameMatches || matchingDirectFindings.length > 0 || filteredChildren.length > 0) {
    const newFindings = nameMatches ? node.findings : matchingDirectFindings
    const childAggregate = new Set<Finding>()
    filteredChildren.forEach(c => c.allFindings.forEach(f => childAggregate.add(f)))
    const allSet = new Set<Finding>(newFindings)
    childAggregate.forEach(f => allSet.add(f))
    return {
      ...node,
      findings: newFindings,
      children: filteredChildren,
      allFindings: Array.from(allSet),
    }
  }
  return null
}

/* ─── Helpers ─── */
function getFileIcon(name: string, className: string): ReactNode {
  const ext = name.includes('.') ? name.substring(name.lastIndexOf('.')).toLowerCase() : ''
  if (ext === '.py') return <FileCode className={className} />
  if (ext === '.json') return <FileJson className={className} />
  if (ext === '.toml' || ext === '.txt' || ext === '.yml' || ext === '.yaml' || ext === '.cfg' || ext === '.ini') {
    return <FileText className={className} />
  }
  return <FileIcon className={className} />
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const q = query.trim()
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.substring(0, idx)}
      <mark className="bg-amber-300/70 dark:bg-amber-500/30 text-inherit rounded px-0.5">
        {text.substring(idx, idx + q.length)}
      </mark>
      {text.substring(idx + q.length)}
    </>
  )
}

function getSeverityDistribution(findings: Finding[]): Record<Severity, number> {
  const dist: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  findings.forEach(f => { dist[f.severity]++ })
  return dist
}

/* ─── Stat Box ─── */
function StatBox({
  icon, label, value, subValue, color,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  subValue?: string
  color: string
}) {
  return (
    <div className="rounded-md border bg-card/50 p-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-0.5">
        <span className={color}>{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div className={`text-base font-bold ${color} truncate`}>{value}</div>
      {subValue && <div className="text-[10px] text-muted-foreground truncate">{subValue}</div>}
    </div>
  )
}

/* ─── Finding Row (compact) ─── */
function FindingRow({
  finding, onNavigate, bookmarks, onToggleBookmark, findingStatuses, onStatusChange, search,
}: {
  finding: Finding
  onNavigate: (f: Finding) => void
  bookmarks: Set<string | number>
  onToggleBookmark: (task: string | number) => void
  findingStatuses: Record<string, AuditStatus>
  onStatusChange: (task: string | number, status: string) => void
  search: string
}) {
  const status = findingStatuses[String(finding.task)] ?? 'not-started'
  const sev = severityConfig[finding.severity]
  const isBookmarked = bookmarks.has(finding.task)

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border bg-card/40 hover:bg-muted/40 transition-colors group">
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${SEVERITY_DOT_CLASS[finding.severity]}`}
        title={sev.label}
        aria-label={`Severity: ${sev.label}`}
      />
      <Badge
        variant="outline"
        className={`text-[10px] font-mono px-1.5 py-0 h-5 flex-shrink-0 ${sev.border} ${sev.text}`}
      >
        T{finding.task}
      </Badge>
      <button
        type="button"
        onClick={() => onNavigate(finding)}
        className="text-xs text-left flex-1 min-w-0 truncate hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
        title={finding.title}
      >
        {highlightText(finding.title, search)}
      </button>
      <button
        type="button"
        onClick={() => onToggleBookmark(finding.task)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 flex-shrink-0"
        aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
      >
        {isBookmarked
          ? <BookmarkCheck className="h-3.5 w-3.5 text-amber-600" />
          : <Bookmark className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      <Select value={status} onValueChange={(v) => onStatusChange(finding.task, v)}>
        <SelectTrigger className="h-6 w-[110px] text-[10px] px-1.5 btn-subtle-hover flex-shrink-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUDIT_STATUS_ORDER.map(s => (
            <SelectItem key={s} value={s} className="text-xs">
              {auditStatusConfig[s].label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/* ─── Tree Row (recursive) ─── */
interface TreeRowProps {
  node: TreeNode
  depth: number
  expandedDirs: Set<string>
  expandedFiles: Set<string>
  onToggleDir: (path: string) => void
  onToggleFile: (path: string) => void
  onNavigateToFinding: (f: Finding) => void
  bookmarks: Set<string | number>
  onToggleBookmark: (task: string | number) => void
  findingStatuses: Record<string, AuditStatus>
  onStatusChange: (task: string | number, status: string) => void
  search: string
}

function TreeRow({
  node, depth, expandedDirs, expandedFiles, onToggleDir, onToggleFile,
  onNavigateToFinding, bookmarks, onToggleBookmark, findingStatuses, onStatusChange, search,
}: TreeRowProps) {
  const isDir = node.type === 'dir'
  const isExpanded = isDir ? expandedDirs.has(node.path) : expandedFiles.has(node.path)
  const dist = getSeverityDistribution(node.allFindings)
  const hasChildren = isDir && node.children.length > 0
  const hasFindings = node.findings.length > 0
  const canToggle = isDir ? hasChildren || hasFindings : hasFindings
  const indent = depth * 16

  const handleClick = () => {
    if (isDir) onToggleDir(node.path)
    else onToggleFile(node.path)
  }
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleClick()
    }
  }

  return (
    <div>
      <div
        role="button"
        tabIndex={canToggle ? 0 : -1}
        onClick={canToggle ? handleClick : undefined}
        onKeyDown={canToggle ? handleKeyDown : undefined}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-muted/40 transition-colors group"
        style={{ paddingLeft: `${indent + 8}px` }}
        aria-expanded={canToggle ? isExpanded : undefined}
      >
        {/* Chevron */}
        {canToggle ? (
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.15 }}
            className="flex-shrink-0 inline-flex"
          >
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          </motion.span>
        ) : (
          <span className="w-3.5 inline-block flex-shrink-0" />
        )}

        {/* Icon */}
        {isDir ? (
          isExpanded
            ? <FolderOpen className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            : <Folder className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
        ) : (
          <span className="flex-shrink-0 text-emerald-600 dark:text-emerald-400">
            {getFileIcon(node.name, 'h-4 w-4')}
          </span>
        )}

        {/* Name */}
        <span className="text-sm font-medium truncate flex-1 min-w-0">
          {highlightText(node.name, search)}
          {isDir && <span className="text-muted-foreground">/</span>}
        </span>

        {/* Severity dots (only show non-zero) */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <TooltipProvider delayDuration={300}>
            {SEVERITY_ORDER.map(sev => dist[sev] > 0 && (
              <Tooltip key={sev}>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-0.5 cursor-help">
                    <span className={`w-2 h-2 rounded-full ${SEVERITY_DOT_CLASS[sev]}`} />
                    <span className="text-[10px] font-mono text-muted-foreground">{dist[sev]}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {dist[sev]} {severityConfig[sev].label.toLowerCase()}
                </TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>

        {/* Count badge */}
        <Badge
          variant="secondary"
          className="text-[10px] h-5 px-1.5 flex-shrink-0"
          title={`${node.allFindings.length} finding${node.allFindings.length === 1 ? '' : 's'}`}
        >
          {node.allFindings.length}
        </Badge>
      </div>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* Directory-wide findings (for `tests/`-style entries) */}
            {isDir && hasFindings && (
              <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="py-1">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground px-2 py-1 flex items-center gap-1">
                  <Folder className="h-3 w-3" />
                  Directory-wide findings ({node.findings.length})
                </div>
                <div className="space-y-1">
                  {node.findings.map(f => (
                    <FindingRow
                      key={`dir-${node.path}-${f.task}`}
                      finding={f}
                      onNavigate={onNavigateToFinding}
                      bookmarks={bookmarks}
                      onToggleBookmark={onToggleBookmark}
                      findingStatuses={findingStatuses}
                      onStatusChange={onStatusChange}
                      search={search}
                    />
                  ))}
                </div>
              </div>
            )}
            {/* File findings */}
            {!isDir && hasFindings && (
              <div style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }} className="py-1 space-y-1">
                {node.findings.map(f => (
                  <FindingRow
                    key={`file-${node.path}-${f.task}`}
                    finding={f}
                    onNavigate={onNavigateToFinding}
                    bookmarks={bookmarks}
                    onToggleBookmark={onToggleBookmark}
                    findingStatuses={findingStatuses}
                    onStatusChange={onStatusChange}
                    search={search}
                  />
                ))}
              </div>
            )}
            {/* Directory children */}
            {isDir && hasChildren && (
              <div className="border-l border-border/30 ml-4">
                {node.children.map(child => (
                  <TreeRow
                    key={child.path}
                    node={child}
                    depth={depth + 1}
                    expandedDirs={expandedDirs}
                    expandedFiles={expandedFiles}
                    onToggleDir={onToggleDir}
                    onToggleFile={onToggleFile}
                    onNavigateToFinding={onNavigateToFinding}
                    bookmarks={bookmarks}
                    onToggleBookmark={onToggleBookmark}
                    findingStatuses={findingStatuses}
                    onStatusChange={onStatusChange}
                    search={search}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ─── Main Component ─── */
export function FileTreeView({
  findings, onNavigateToFinding, bookmarks, onToggleBookmark,
  findingStatuses, onStatusChange,
}: FileTreeViewProps) {
  const [search, setSearch] = useState('')
  const [sortOption, setSortOption] = useState<SortOption>('name')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())

  /* Build the master tree once per findings change */
  const tree = useMemo(() => buildTree(findings), [findings])

  /* Apply filter + sort for display */
  const displayTree = useMemo(() => {
    const filtered = filterTree(tree, search) ?? tree
    sortTree(filtered, sortOption)
    return filtered
  }, [tree, search, sortOption])

  /* Aggregate stats over the unfiltered tree */
  const stats = useMemo(() => {
    let totalFiles = 0
    let totalFindings = 0
    let filesWithCritical = 0
    let maxCount = 0
    let maxName = ''
    function walk(node: TreeNode) {
      if (node.type === 'file') {
        totalFiles++
        totalFindings += node.findings.length
        if (node.findings.length > maxCount) {
          maxCount = node.findings.length
          maxName = node.path
        }
        if (node.findings.some(f => f.severity === 'critical')) filesWithCritical++
      }
      node.children.forEach(walk)
    }
    walk(tree)
    return {
      totalFiles,
      totalFindings,
      filesWithCritical,
      mostAffectedFile: maxCount > 0 ? { name: maxName, count: maxCount } : null,
    }
  }, [tree])

  /* Collect all dir + file paths (for Expand All) */
  const allPaths = useMemo(() => {
    const dirs: string[] = []
    const files: string[] = []
    function walk(node: TreeNode) {
      if (node.path === '') {
        node.children.forEach(walk)
        return
      }
      if (node.type === 'dir') {
        if (node.children.length > 0 || node.findings.length > 0) dirs.push(node.path)
        node.children.forEach(walk)
      } else {
        if (node.findings.length > 0) files.push(node.path)
      }
    }
    walk(tree)
    return { dirs, files }
  }, [tree])

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const toggleFile = useCallback((path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const expandAll = useCallback(() => {
    setExpandedDirs(new Set(allPaths.dirs))
    setExpandedFiles(new Set(allPaths.files))
  }, [allPaths])

  const collapseAll = useCallback(() => {
    setExpandedDirs(new Set())
    setExpandedFiles(new Set())
  }, [])

  const resetFilter = useCallback(() => setSearch(''), [])

  const hasVisibleContent = displayTree.children.length > 0

  return (
    <Card className="glass-card card-hover-enhanced">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 heading-section">
          <FolderTree className="h-4 w-4 text-emerald-600" /> File-Tree Findings
        </CardTitle>
        <CardDescription>
          Browse findings grouped by file path — see exactly where to look in the codebase.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatBox
            icon={<FileIcon className="h-3.5 w-3.5" />}
            label="Total Files"
            value={stats.totalFiles}
            color="text-emerald-600"
          />
          <StatBox
            icon={<FileWarning className="h-3.5 w-3.5" />}
            label="Total Findings"
            value={stats.totalFindings}
            color="text-orange-600"
          />
          <StatBox
            icon={<Flame className="h-3.5 w-3.5" />}
            label="Files w/ Critical"
            value={stats.filesWithCritical}
            color="text-red-600"
          />
          <StatBox
            icon={<Hash className="h-3.5 w-3.5" />}
            label="Most Affected"
            value={stats.mostAffectedFile ? stats.mostAffectedFile.name.split('/').pop() : '—'}
            subValue={stats.mostAffectedFile ? `${stats.mostAffectedFile.count} findings` : ''}
            color="text-teal-600"
          />
        </div>

        {/* Search + controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by file name or finding title…"
              className="pl-8 h-9 text-sm btn-subtle-hover"
              aria-label="Filter file tree"
            />
          </div>
          <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
            <SelectTrigger className="w-[160px] h-9 btn-subtle-hover" aria-label="Sort files">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">By name (A-Z)</SelectItem>
              <SelectItem value="count">By finding count</SelectItem>
              <SelectItem value="severity">By severity (critical first)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={expandAll}
            className="h-9 btn-subtle-hover"
            aria-label="Expand all"
          >
            <Expand className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Expand All</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={collapseAll}
            className="h-9 btn-subtle-hover"
            aria-label="Collapse all"
          >
            <ChevronsDownUp className="h-3.5 w-3.5 mr-1" />
            <span className="hidden sm:inline">Collapse All</span>
          </Button>
        </div>

        {/* Tree container */}
        {hasVisibleContent ? (
          <div className="max-h-[600px] overflow-y-auto rounded-md border bg-card/30 p-2 scrollbar-styled">
            {displayTree.children.map(child => (
              <TreeRow
                key={child.path}
                node={child}
                depth={0}
                expandedDirs={expandedDirs}
                expandedFiles={expandedFiles}
                onToggleDir={toggleDir}
                onToggleFile={toggleFile}
                onNavigateToFinding={onNavigateToFinding}
                bookmarks={bookmarks}
                onToggleBookmark={onToggleBookmark}
                findingStatuses={findingStatuses}
                onStatusChange={onStatusChange}
                search={search}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center text-muted-foreground rounded-md border bg-card/30">
            <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <div className="text-sm font-medium mb-1">No files match your filters</div>
            <div className="text-xs mb-3">Try a different search term or reset.</div>
            <Button variant="outline" size="sm" onClick={resetFilter}>
              Reset filter
            </Button>
          </div>
        )}

        {/* Footer hint */}
        <div className="text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Critical
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-500" /> High
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-yellow-500" /> Medium
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-400" /> Low
          </span>
          <span className="ml-auto">Click a file row to expand findings · Click a finding title to view details</span>
        </div>
      </CardContent>
    </Card>
  )
}
