'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import {
  Command, CommandInput, CommandList, CommandEmpty,
  CommandGroup, CommandItem, CommandSeparator,
} from '@/components/ui/command'
import { Badge } from '@/components/ui/badge'
import {
  Search, Bug, LayoutDashboard, GitBranch, Zap, Network, Settings,
  Sun, ArrowUp, FileJson, FileSpreadsheet, FileText,
  Command as CommandIcon, CornerDownLeft, Star, Filter,
} from 'lucide-react'
import { type Finding } from '@/lib/data'
import type { Severity, Tier } from '@/lib/audit-types'

/* ─── TYPES ─── */
export interface CommandPaletteProps {
  findings: Finding[]
  onNavigateToFinding: (finding: Finding) => void
  onSwitchTab: (tab: string) => void
  onApplyPreset: (presetName: string) => void
  onToggleTheme: () => void
  onExport: (format: 'json' | 'csv' | 'markdown') => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

/* ─── SEVERITY COLORS ─── */
const severityColors: Record<Severity, string> = {
  critical: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
}

const severityLabel: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

/* ─── STRUCTURED SEARCH FILTER DEFINITIONS ─── */
interface FilterKeyDef {
  key: string
  label: string
  values: string[]
  description: string
}

const FILTER_KEYS: FilterKeyDef[] = [
  {
    key: 'severity',
    label: 'Severity',
    values: ['critical', 'high', 'medium', 'low'],
    description: 'Filter by severity level',
  },
  {
    key: 'status',
    label: 'Status',
    values: ['not-started', 'in-progress', 'fixed', 'wont-fix'],
    description: 'Filter by audit status',
  },
  {
    key: 'tier',
    label: 'Tier',
    values: ['tier0', 'tier1', 'tier2', 'additional', 'deferred'],
    description: 'Filter by priority tier',
  },
  {
    key: 'category',
    label: 'Category',
    values: ['safety', 'validation', 'data-model', 'ci', 'testing', 'documentation', 'deprecation', 'security', 'metrics', 'ui', 'api', 'pipeline'],
    description: 'Filter by finding category',
  },
  {
    key: 'module',
    label: 'Module',
    values: ['m1', 'm2', 'm3', 'm4', 'm5'],
    description: 'Filter by remediation module/phase',
  },
]

/* ─── PARSE STRUCTURED SEARCH QUERY ─── */
interface ParsedQuery {
  filters: Map<string, string>  // key → value (e.g. 'severity' → 'critical')
  freeText: string              // remaining unstructured text
  activeFilterKey: string | null // if user just typed a colon, which key
  activeFilterPartial: string | null // if user is typing a value after colon
}

function parseSearchQuery(query: string): ParsedQuery {
  const filters = new Map<string, string>()
  const tokens: string[] = []
  let activeFilterKey: string | null = null
  let activeFilterPartial: string | null = null

  // Split by spaces but keep filter tokens together
  const parts = query.split(/\s+/)

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const colonIdx = part.indexOf(':')

    if (colonIdx > 0) {
      const key = part.slice(0, colonIdx).toLowerCase()
      const value = part.slice(colonIdx + 1).toLowerCase()

      // Check if this is a recognized filter key
      const filterDef = FILTER_KEYS.find(f => f.key === key)
      if (filterDef) {
        if (value) {
          // Has a value after colon
          filters.set(key, value)
        } else {
          // Just typed the colon, show value suggestions
          activeFilterKey = key
          activeFilterPartial = ''
        }
      } else {
        // Not a recognized key, treat as free text
        tokens.push(part)
      }
    } else if (colonIdx === 0) {
      // Starts with colon (e.g. ":critical") — treat as free text
      tokens.push(part)
    } else {
      tokens.push(part)
    }
  }

  // Check if the last token is a partial filter (user typing value after recognized key:colon)
  // e.g. "severity:cri" — should show suggestions matching "cri"
  if (parts.length > 0) {
    const lastPart = parts[parts.length - 1]
    const colonIdx = lastPart.indexOf(':')
    if (colonIdx > 0) {
      const key = lastPart.slice(0, colonIdx).toLowerCase()
      const partialValue = lastPart.slice(colonIdx + 1).toLowerCase()
      const filterDef = FILTER_KEYS.find(f => f.key === key)
      if (filterDef && partialValue && !filters.has(key)) {
        // User is typing a partial value for a recognized key
        activeFilterKey = key
        activeFilterPartial = partialValue
        // Remove from tokens since it's a filter (even if incomplete)
        tokens.pop()
      }
    }
  }

  const freeText = tokens.join(' ').trim()
  return { filters, freeText, activeFilterKey, activeFilterPartial }
}

/* ─── MATCH FINDING AGAINST PARSED QUERY ─── */
function matchFinding(f: Finding, parsed: ParsedQuery, auditStatusMap?: Map<string, string>): boolean {
  // Check each filter
  for (const [key, value] of parsed.filters) {
    switch (key) {
      case 'severity':
        if (!f.severity.toLowerCase().includes(value)) return false
        break
      case 'status': {
        const status = auditStatusMap?.get(String(f.task)) ?? 'not-started'
        if (!status.toLowerCase().includes(value)) return false
        break
      }
      case 'tier':
        if (!f.tier.toLowerCase().includes(value)) return false
        break
      case 'category':
        // Match against the full category name (e.g. "Safety Guard" matches "safety")
        if (!f.category.toLowerCase().includes(value)) return false
        break
      case 'module': {
        // Module maps to phase: m1=Phase1, m2=Phase2, etc.
        // Check if the finding's task is in the corresponding phase
        const moduleToPhase: Record<string, string[]> = {
          m1: ['1', '2', '3', '8', '11', '19'],
          m2: ['13', '14', '15', '17', '18'],
          m3: ['4', '20', '5', '12'],
          m4: ['9', '10', '16'],
          m5: ['6', '7'],
        }
        const phaseTasks = moduleToPhase[value]
        if (!phaseTasks || !phaseTasks.includes(String(f.task))) return false
        break
      }
      default:
        // Unknown filter key — skip
        break
    }
  }

  // Check free text
  if (parsed.freeText) {
    const haystack = [
      `task ${String(f.task)}`,
      String(f.task),
      f.title,
      f.summary,
      f.claim,
      f.category,
      ...f.findingIds,
    ].join(' ').toLowerCase()
    if (!haystack.includes(parsed.freeText)) return false
  }

  return true
}

/* ─── TAB DEFINITIONS ─── */
interface TabDef { value: string; label: string; icon: typeof LayoutDashboard; keywords: string[] }
const TAB_DEFS: TabDef[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard, keywords: ['overview', 'dashboard', 'summary', 'home'] },
  { value: 'findings', label: 'Findings', icon: Bug, keywords: ['findings', 'issues', 'tasks', 'bugs'] },
  { value: 'roadmap', label: 'Roadmap', icon: GitBranch, keywords: ['roadmap', 'plan', 'timeline', 'sequence'] },
  { value: 'unified', label: 'Unified', icon: Zap, keywords: ['unified', 'modules', 'execution'] },
  { value: 'dependencies', label: 'Dependencies', icon: Network, keywords: ['dependencies', 'deps', 'graph', 'network', 'dag'] },
  { value: 'admin', label: 'Admin', icon: Settings, keywords: ['admin', 'settings', 'github', 'config'] },
]

/* ─── PRESET DEFINITIONS ─── */
interface PresetDef { name: string; icon: typeof Star; keywords: string[]; hint: string }
const PRESET_DEFS: PresetDef[] = [
  { name: 'Critical Only', icon: Star, keywords: ['critical', 'preset', 'filter', 'critical-only'], hint: 'Severity = Critical' },
  { name: 'Ready to Fix', icon: Star, keywords: ['ready', 'preset', 'filter', 'not-started', 'todo', 'ready-to-fix'], hint: 'Status = Not started' },
  { name: 'In Progress', icon: Star, keywords: ['in progress', 'preset', 'filter', 'working', 'in-progress'], hint: 'Status = In progress' },
]

/* ─── ACTION DEFINITIONS ─── */
interface ActionDef {
  id: string
  label: string
  description: string
  icon: typeof Sun
  keywords: string[]
  hint: string
  run: () => void
}

/* ─── RECENT COMMANDS STORAGE ─── */
const RECENT_KEY = 'cmd-recent'
const MAX_RECENT = 5

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT)
  } catch {
    return []
  }
}

function saveRecent(items: string[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)))
  } catch {
    /* ignore */
  }
}

/* ─── COMPONENT ─── */
export function CommandPalette({
  findings,
  onNavigateToFinding,
  onSwitchTab,
  onApplyPreset,
  onToggleTheme,
  onExport,
  open,
  onOpenChange,
  auditStatuses,
}: CommandPaletteProps & { auditStatuses?: Record<string, string> }) {
  const [search, setSearch] = useState('')
  const [recent, setRecent] = useState<string[]>([])
  const inputRef = useRef<HTMLDivElement | null>(null)

  // Load recent commands on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setRecent(loadRecent())
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onOpenChange])

  // Clear search when palette closes
  useEffect(() => {
    if (!open) {
      const id = requestAnimationFrame(() => setSearch(''))
      return () => cancelAnimationFrame(id)
    }
  }, [open])

  // Record a recent command (dedupe + bring to front)
  const recordRecent = useCallback((id: string) => {
    setRecent(prev => {
      const next = [id, ...prev.filter(x => x !== id)].slice(0, MAX_RECENT)
      saveRecent(next)
      return next
    })
  }, [])

  // Parse the search query
  const parsedQuery = useMemo(() => parseSearchQuery(search), [search])
  const lowerSearch = search.trim().toLowerCase()

  // Build audit status map for status filtering
  const auditStatusMap = useMemo(() => {
    const map = new Map<string, string>()
    if (auditStatuses) {
      Object.entries(auditStatuses).forEach(([task, status]) => map.set(task, status))
    }
    return map
  }, [auditStatuses])

  /* ─── ACTION HANDLERS ─── */
  const handleNavigateFinding = useCallback((finding: Finding) => {
    const id = `finding:${String(finding.task)}`
    recordRecent(id)
    onNavigateToFinding(finding)
    onSwitchTab('findings')
    onOpenChange(false)
  }, [onNavigateToFinding, onSwitchTab, onOpenChange, recordRecent])

  const handleSwitchTab = useCallback((tab: string) => {
    recordRecent(`tab:${tab}`)
    onSwitchTab(tab)
    onOpenChange(false)
  }, [onSwitchTab, onOpenChange, recordRecent])

  const handleApplyPreset = useCallback((name: string) => {
    recordRecent(`preset:${name}`)
    onApplyPreset(name)
    onOpenChange(false)
  }, [onApplyPreset, onOpenChange, recordRecent])

  const handleToggleTheme = useCallback(() => {
    recordRecent('action:theme')
    onToggleTheme()
    onOpenChange(false)
  }, [onToggleTheme, onOpenChange, recordRecent])

  const handleScrollTop = useCallback(() => {
    recordRecent('action:top')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    onOpenChange(false)
  }, [onOpenChange, recordRecent])

  const handleExport = useCallback((format: 'json' | 'csv' | 'markdown') => {
    recordRecent(`action:export-${format}`)
    onExport(format)
    onOpenChange(false)
  }, [onExport, onOpenChange, recordRecent])

  // Apply a filter suggestion (insert into search)
  const applyFilterSuggestion = useCallback((key: string, value: string) => {
    // Find existing partial filter and replace, or append
    const currentSearch = search
    const parts = currentSearch.split(/\s+/)
    const newParts: string[] = []
    let replaced = false

    for (const part of parts) {
      const colonIdx = part.indexOf(':')
      if (colonIdx > 0) {
        const partKey = part.slice(0, colonIdx).toLowerCase()
        if (partKey === key && !replaced) {
          newParts.push(`${key}:${value}`)
          replaced = true
        } else {
          newParts.push(part)
        }
      } else {
        newParts.push(part)
      }
    }

    if (!replaced) {
      newParts.push(`${key}:${value}`)
    }

    setSearch(newParts.filter(p => p).join(' ') + ' ')
  }, [search])

  /* ─── FILTERED FINDINGS (using structured search + free text) ─── */
  const hasAnyQuery = parsedQuery.filters.size > 0 || parsedQuery.freeText.length > 0
  const matchingFindings = useMemo(() => {
    if (!hasAnyQuery) return []
    return findings.filter(f => matchFinding(f, parsedQuery, auditStatusMap)).slice(0, 8)
  }, [findings, parsedQuery, auditStatusMap, hasAnyQuery])

  /* ─── ACTIVE FILTER KEY SUGGESTIONS ─── */
  const activeFilterSuggestions = useMemo(() => {
    if (!parsedQuery.activeFilterKey) return null
    const filterDef = FILTER_KEYS.find(f => f.key === parsedQuery.activeFilterKey)
    if (!filterDef) return null

    const partial = parsedQuery.activeFilterPartial ?? ''
    const matchingValues = filterDef.values.filter(v =>
      !partial || v.startsWith(partial) || v.includes(partial)
    )

    return {
      key: parsedQuery.activeFilterKey,
      label: filterDef.label,
      description: filterDef.description,
      values: matchingValues,
    }
  }, [parsedQuery.activeFilterKey, parsedQuery.activeFilterPartial])

  /* ─── SHOW FILTER KEY HINT (when user types a colon with no recognized key) ─── */
  const showFilterKeyHints = useMemo(() => {
    // Show when the last token is something like "xyz:" (just typed colon but key not recognized)
    // OR show when there's no active filter key and the query ends with a space (ready for a new filter)
    // Actually: show when we have an activeFilterKey with empty value (just typed "severity:")
    // This is already handled by activeFilterSuggestions above
    return null
  }, [])

  /* ─── BUILD RECENT ITEMS LIST (only when search is empty) ─── */
  const recentItems = useMemo(() => {
    if (lowerSearch || recent.length === 0) return []
    return recent.map(id => {
      if (id.startsWith('finding:')) {
        const taskStr = id.slice('finding:'.length)
        const f = findings.find(x => String(x.task) === taskStr)
        if (!f) return null
        return { kind: 'finding' as const, finding: f, id }
      }
      if (id.startsWith('tab:')) {
        const tab = id.slice('tab:'.length)
        const def = TAB_DEFS.find(t => t.value === tab)
        if (!def) return null
        return { kind: 'tab' as const, tab: def, id }
      }
      if (id.startsWith('preset:')) {
        const name = id.slice('preset:'.length)
        const def = PRESET_DEFS.find(p => p.name === name)
        if (!def) return null
        return { kind: 'preset' as const, preset: def, id }
      }
      if (id === 'action:theme') return { kind: 'action' as const, actionId: 'theme', id }
      if (id === 'action:top') return { kind: 'action' as const, actionId: 'top', id }
      if (id.startsWith('action:export-')) {
        const fmt = id.slice('action:export-'.length) as 'json' | 'csv' | 'markdown'
        return { kind: 'action' as const, actionId: `export-${fmt}` as const, id }
      }
      return null
    }).filter((x): x is NonNullable<typeof x> => x !== null)
  }, [recent, lowerSearch, findings])

  /* ─── ACTIONS LIST ─── */
  const actions: ActionDef[] = useMemo(() => [
    {
      id: 'theme',
      label: 'Toggle Theme',
      description: 'Switch between light and dark mode',
      icon: Sun,
      keywords: ['theme', 'light', 'dark', 'mode', 'toggle', 'appearance'],
      hint: 'Theme',
      run: handleToggleTheme,
    },
    {
      id: 'top',
      label: 'Scroll to Top',
      description: 'Jump back to the top of the page',
      icon: ArrowUp,
      keywords: ['top', 'scroll', 'up', 'beginning', 'start'],
      hint: 'Scroll',
      run: handleScrollTop,
    },
    {
      id: 'export-json',
      label: 'Export as JSON',
      description: 'Download all findings as a JSON file',
      icon: FileJson,
      keywords: ['export', 'json', 'download', 'save'],
      hint: 'Export',
      run: () => handleExport('json'),
    },
    {
      id: 'export-csv',
      label: 'Export as CSV',
      description: 'Download all findings as a CSV spreadsheet',
      icon: FileSpreadsheet,
      keywords: ['export', 'csv', 'download', 'spreadsheet', 'excel'],
      hint: 'Export',
      run: () => handleExport('csv'),
    },
    {
      id: 'export-markdown',
      label: 'Export as Markdown',
      description: 'Download all findings as a Markdown document',
      icon: FileText,
      keywords: ['export', 'markdown', 'md', 'download', 'document'],
      hint: 'Export',
      run: () => handleExport('markdown'),
    },
  ], [handleToggleTheme, handleScrollTop, handleExport])

  /* ─── PARSE SEARCH DISPLAY (highlight structured filters) ─── */
  const searchDisplayParts = useMemo(() => {
    const parts = search.split(/\s+/)
    return parts.map(part => {
      const colonIdx = part.indexOf(':')
      if (colonIdx > 0) {
        const key = part.slice(0, colonIdx).toLowerCase()
        const isRecognized = FILTER_KEYS.some(f => f.key === key)
        if (isRecognized) {
          return { text: part, type: 'filter' as const }
        }
      }
      return { text: part, type: 'text' as const }
    })
  }, [search])

  /* ─── RENDER ─── */
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl p-0 overflow-hidden border-2 border-emerald-500/20 bg-popover/95 backdrop-blur-xl shadow-2xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <DialogDescription className="sr-only">
          Search findings, switch tabs, apply presets, toggle theme, and trigger exports. Use syntax like severity:critical or tier:tier0 for structured filtering.
        </DialogDescription>
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          ref={inputRef}
        >
          <Command
            className="rounded-lg"
            shouldFilter={false}
            loop
          >
            {/* ─── INPUT ─── */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-border/60">
              <Search className="h-5 w-5 text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0 relative">
                {/* Visual display of parsed query (overlay behind input) */}
                {search && (
                  <div className="absolute inset-0 flex items-center gap-1 overflow-hidden pointer-events-none z-0" aria-hidden="true">
                    {searchDisplayParts.filter(p => p.text).map((part, i) => (
                      <span key={i} className={
                        part.type === 'filter'
                          ? 'inline-flex items-center px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-sm font-medium border border-emerald-500/30'
                          : 'text-sm text-transparent'
                      }>
                        {part.text}
                      </span>
                    ))}
                  </div>
                )}
                <CommandInput
                  placeholder="Search… try severity:critical, tier:tier0, status:fixed, or free text"
                  className="flex-1 h-9 text-sm relative z-10 bg-transparent"
                  value={search}
                  onValueChange={setSearch}
                />
              </div>
              <kbd className="hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-mono font-semibold bg-muted border border-border rounded text-muted-foreground">
                ESC
              </kbd>
            </div>

            {/* ─── FILTER KEY HINTS (show when typing a colon) ─── */}
            {activeFilterSuggestions && (
              <div className="px-3 py-2 border-b border-border/30 bg-emerald-500/5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Filter className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    {activeFilterSuggestions.label} filter
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    — {activeFilterSuggestions.description}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {activeFilterSuggestions.values.map(v => (
                    <button
                      key={v}
                      type="button"
                      className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-background border border-emerald-500/20 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition-colors cursor-pointer"
                      onClick={() => applyFilterSuggestion(activeFilterSuggestions.key, v)}
                    >
                      <span className="text-emerald-600">{activeFilterSuggestions.key}</span>
                      <span className="text-muted-foreground">:</span>
                      <span className="text-foreground">{v}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─── ACTIVE FILTERS DISPLAY ─── */}
            {parsedQuery.filters.size > 0 && !activeFilterSuggestions && (
              <div className="px-3 py-2 border-b border-border/30 bg-muted/30">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Filter className="h-3 w-3 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">Active filters:</span>
                  {Array.from(parsedQuery.filters.entries()).map(([key, value]) => (
                    <Badge
                      key={key}
                      variant="outline"
                      className="text-[10px] bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                    >
                      {key}:{value}
                    </Badge>
                  ))}
                  {parsedQuery.freeText && (
                    <Badge variant="outline" className="text-[10px] bg-background">
                      &ldquo;{parsedQuery.freeText}&rdquo;
                    </Badge>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    — {matchingFindings.length} result{matchingFindings.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            )}

            {/* ─── LIST ─── */}
            <CommandList className="max-h-[60vh] overflow-y-auto scrollbar-custom">
              <CommandEmpty>
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No results for &ldquo;<span className="text-foreground font-medium">{search}</span>&rdquo;
                </div>
              </CommandEmpty>

              {/* ─── RECENT (only when search is empty) ─── */}
              {!lowerSearch && recentItems.length > 0 && (
                <CommandGroup heading="Recent">
                  {recentItems.map(item => {
                    if (item.kind === 'finding') {
                      const f = item.finding
                      const sev = severityColors[f.severity]
                      return (
                        <CommandItem
                          key={item.id}
                          value={`recent-finding-${String(f.task)}`}
                          onSelect={() => handleNavigateFinding(f)}
                          className="gap-2"
                        >
                          <Bug className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                            Task {String(f.task)}
                          </span>
                          <span className="flex-1 truncate text-sm">{f.title}</span>
                          <Badge
                            variant="outline"
                            className="text-[9px] px-1.5 py-0"
                            style={{ borderColor: sev, color: sev }}
                          >
                            {severityLabel[f.severity]}
                          </Badge>
                        </CommandItem>
                      )
                    }
                    if (item.kind === 'tab') {
                      const Icon = item.tab.icon
                      return (
                        <CommandItem
                          key={item.id}
                          value={`recent-tab-${item.tab.value}`}
                          onSelect={() => handleSwitchTab(item.tab.value)}
                          className="gap-2"
                        >
                          <Icon className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span className="flex-1 text-sm">Go to {item.tab.label}</span>
                          <span className="text-[10px] text-muted-foreground">Tab</span>
                        </CommandItem>
                      )
                    }
                    if (item.kind === 'preset') {
                      const Icon = item.preset.icon
                      return (
                        <CommandItem
                          key={item.id}
                          value={`recent-preset-${item.preset.name}`}
                          onSelect={() => handleApplyPreset(item.preset.name)}
                          className="gap-2"
                        >
                          <Icon className="h-4 w-4 text-amber-600 shrink-0" />
                          <span className="flex-1 text-sm">Preset: {item.preset.name}</span>
                          <span className="text-[10px] text-muted-foreground">{item.preset.hint}</span>
                        </CommandItem>
                      )
                    }
                    // action
                    const actionDef = actions.find(a => a.id === item.actionId)
                    if (!actionDef) return null
                    const Icon = actionDef.icon
                    return (
                      <CommandItem
                        key={item.id}
                        value={`recent-action-${actionDef.id}`}
                        onSelect={() => actionDef.run()}
                        className="gap-2"
                      >
                        <Icon className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="flex-1 text-sm">{actionDef.label}</span>
                        <span className="text-[10px] text-muted-foreground">{actionDef.hint}</span>
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {/* ─── FINDINGS ─── */}
              {matchingFindings.length > 0 && (
                <CommandGroup heading="Findings">
                  {matchingFindings.map(f => {
                    const sev = severityColors[f.severity]
                    return (
                      <CommandItem
                        key={`finding-${String(f.task)}`}
                        value={`finding-${String(f.task)}-${f.title}`}
                        onSelect={() => handleNavigateFinding(f)}
                        keywords={[
                          `task ${String(f.task)}`,
                          String(f.task),
                          f.summary,
                          f.category,
                          ...f.findingIds,
                          severityLabel[f.severity],
                        ]}
                        className="gap-2"
                      >
                        <Bug className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">
                          Task {String(f.task)}
                        </span>
                        <span className="flex-1 truncate text-sm">{f.title}</span>
                        <Badge
                          variant="outline"
                          className="text-[9px] px-1.5 py-0"
                          style={{ borderColor: sev, color: sev }}
                        >
                          {severityLabel[f.severity]}
                        </Badge>
                        <CornerDownLeft className="h-3 w-3 text-muted-foreground/50" />
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}

              {/* ─── TABS ─── */}
              <CommandSeparator />
              <CommandGroup heading="Tabs">
                {TAB_DEFS.map(t => {
                  const Icon = t.icon
                  return (
                    <CommandItem
                      key={`tab-${t.value}`}
                      value={`tab-${t.value}-${t.label}`}
                      onSelect={() => handleSwitchTab(t.value)}
                      keywords={t.keywords}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="flex-1 text-sm">Go to {t.label}</span>
                      <span className="text-[10px] text-muted-foreground">Tab</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>

              {/* ─── PRESETS ─── */}
              <CommandSeparator />
              <CommandGroup heading="Filter Presets">
                {PRESET_DEFS.map(p => {
                  const Icon = p.icon
                  return (
                    <CommandItem
                      key={`preset-${p.name}`}
                      value={`preset-${p.name}`}
                      onSelect={() => handleApplyPreset(p.name)}
                      keywords={p.keywords}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="flex-1 text-sm">Apply preset: {p.name}</span>
                      <span className="text-[10px] text-muted-foreground">{p.hint}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>

              {/* ─── ACTIONS ─── */}
              <CommandSeparator />
              <CommandGroup heading="Actions">
                {actions.map(a => {
                  const Icon = a.icon
                  return (
                    <CommandItem
                      key={`action-${a.id}`}
                      value={`action-${a.id}-${a.label}`}
                      onSelect={() => a.run()}
                      keywords={a.keywords}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4 text-emerald-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{a.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{a.description}</div>
                      </div>
                      <span className="text-[10px] text-muted-foreground">{a.hint}</span>
                    </CommandItem>
                  )
                })}
              </CommandGroup>

              {/* ─── FOOTER HINT ─── */}
              <CommandSeparator alwaysRender />
              <div className="flex items-center justify-between px-3 py-2 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CommandIcon className="h-3 w-3" />
                  <span>Command Palette</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <kbd className="px-1.5 py-0.5 bg-muted border rounded text-[9px] font-mono">↑↓</kbd>
                  <span>navigate</span>
                  <kbd className="px-1.5 py-0.5 bg-muted border rounded text-[9px] font-mono">↵</kbd>
                  <span>select</span>
                  <kbd className="px-1.5 py-0.5 bg-muted border rounded text-[9px] font-mono">esc</kbd>
                  <span>close</span>
                  <span className="text-muted-foreground/60">|</span>
                  <span className="text-emerald-600/80">severity:critical</span>
                  <span className="text-muted-foreground/60">syntax</span>
                </div>
              </div>
            </CommandList>
          </Command>
        </motion.div>
      </DialogContent>
    </Dialog>
  )
}
