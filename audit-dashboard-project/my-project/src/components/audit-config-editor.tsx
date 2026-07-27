'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Settings2, Save, RefreshCw, LoaderCircle, CheckCircle2, AlertCircle,
  RotateCcw, Tag, ListChecks, GitBranch, AlertTriangle,
  Gauge, ShieldAlert, Package, FolderGit2, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from 'sonner'

/* ─── TYPES ─── */
interface ConfigEntry {
  value: unknown
  isDefault: boolean
}

interface ConfigsResponse {
  configs: Record<string, ConfigEntry>
}

interface ConfigEditorState {
  /** The string the user is editing in the textarea (raw JSON). */
  draftText: string
  /** Whether the draft text differs from the saved value. */
  isDirty: boolean
  /** Whether the draft text is valid JSON. */
  isValidJson: boolean
  /** Parse error message if invalid. */
  parseError: string | null
  /** Whether this config is currently being saved. */
  isSaving: boolean
  /** The original JSON string of the saved value, for dirty comparison. */
  savedText: string
}

/* ─── CATEGORY METADATA ─── */
interface CategoryMeta {
  label: string
  description: string
  icon: React.ElementType
  color: string
}

const CATEGORY_META: Record<string, CategoryMeta> = {
  severity_levels: {
    label: 'Severity Levels',
    description: 'The severity taxonomy used to triage findings (critical, high, medium, low). Each level has a label, weight (used in risk scoring), color, and Tailwind border class.',
    icon: AlertTriangle,
    color: 'text-red-600',
  },
  tier_labels: {
    label: 'Tier Labels',
    description: 'Tier groupings for findings (T0 = immediate threats, T1 = data integrity, T2 = quality/UX, deferred, additional). Each tier has a short code, full label, color, and weight (used in risk scoring).',
    icon: GitBranch,
    color: 'text-orange-600',
  },
  categories: {
    label: 'Categories',
    description: 'The list of category names that findings can be tagged with (Data Integrity, Input Validation, Algorithm Logic, etc.). Add or rename categories here to fit your project taxonomy.',
    icon: Tag,
    color: 'text-amber-600',
  },
  audit_statuses: {
    label: 'Audit Statuses',
    description: 'Lifecycle statuses for tracking remediation progress (Not Started, In Progress, Fixed, Won\'t Fix). Each status has a label, color, badge background, and Lucide icon name.',
    icon: ListChecks,
    color: 'text-emerald-600',
  },
  verification_statuses: {
    label: 'Verification Statuses',
    description: 'How each finding was verified (Execution, Code Reading, Logical Derivation, etc.). Each status has a label, color, and badge color.',
    icon: ShieldAlert,
    color: 'text-violet-600',
  },
  effort_levels: {
    label: 'Effort Levels',
    description: 'Effort estimates for proposals (Low, Medium, High). Each level has a label, hour range, and color.',
    icon: Gauge,
    color: 'text-blue-600',
  },
  risk_levels: {
    label: 'Risk Levels',
    description: 'Risk categories for proposals (Low, Medium, High) — used to indicate how reversible a change is. Each level has a label, reversibility description, and color.',
    icon: AlertCircle,
    color: 'text-rose-600',
  },
  module_ids: {
    label: 'Module IDs',
    description: 'Mapping of unified module IDs to display metadata (title and short code). Used to group findings by their owning module.',
    icon: Package,
    color: 'text-teal-600',
  },
  repo_info: {
    label: 'Repository Info',
    description: 'Metadata about the audited repository (owner, name, URL, description). Used in exports and the dashboard header.',
    icon: FolderGit2,
    color: 'text-cyan-600',
  },
}

const CATEGORY_ORDER = [
  'severity_levels',
  'tier_labels',
  'categories',
  'audit_statuses',
  'verification_statuses',
  'effort_levels',
  'risk_levels',
  'module_ids',
  'repo_info',
]

/* ─── COMPONENT ─── */
export function AuditConfigEditor() {
  const [configs, setConfigs] = useState<Record<string, ConfigEntry> | null>(null)
  const [editorState, setEditorState] = useState<Record<string, ConfigEditorState>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isResetting, setIsResetting] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  // Fetch all configs on mount
  const fetchConfigs = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/config')
      if (!res.ok) throw new Error('Failed to fetch configs')
      const data = (await res.json()) as ConfigsResponse
      setConfigs(data.configs)

      // Initialize editor state for each config
      const newState: Record<string, ConfigEditorState> = {}
      for (const [key, entry] of Object.entries(data.configs)) {
        const savedText = JSON.stringify(entry.value, null, 2)
        newState[key] = {
          draftText: savedText,
          savedText,
          isDirty: false,
          isValidJson: true,
          parseError: null,
          isSaving: false,
        }
      }
      setEditorState(newState)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load configs'
      toast.error(message, { duration: 3000 })
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchConfigs()
  }, [fetchConfigs])

  // Update draft text for a config
  const updateDraft = useCallback((key: string, text: string) => {
    setEditorState(prev => {
      const current = prev[key]
      if (!current) return prev
      // Validate JSON
      let isValidJson = true
      let parseError: string | null = null
      try {
        JSON.parse(text)
      } catch (err) {
        isValidJson = false
        parseError = err instanceof Error ? err.message : 'Invalid JSON'
      }
      return {
        ...prev,
        [key]: {
          ...current,
          draftText: text,
          isDirty: text !== current.savedText,
          isValidJson,
          parseError,
        },
      }
    })
  }, [])

  // Save a single config
  const saveConfig = useCallback(async (key: string) => {
    const state = editorState[key]
    if (!state || !state.isValidJson || state.isSaving) return

    setEditorState(prev => ({
      ...prev,
      [key]: { ...prev[key]!, isSaving: true },
    }))

    try {
      const value = JSON.parse(state.draftText)
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err as Record<string, string>).error ?? 'Failed to save config')
      }
      // Mark as saved
      setEditorState(prev => ({
        ...prev,
        [key]: {
          ...prev[key]!,
          savedText: state.draftText,
          isDirty: false,
          isSaving: false,
        },
      }))
      // Update configs state to reflect isDefault = false
      setConfigs(prev => prev ? {
        ...prev,
        [key]: { value, isDefault: false },
      } : prev)
      toast.success(`Saved "${key}"`, { duration: 2000 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save'
      toast.error(message, { duration: 3000 })
      setEditorState(prev => ({
        ...prev,
        [key]: { ...prev[key]!, isSaving: false },
      }))
    }
  }, [editorState])

  // Revert a single config to default (DELETE)
  const revertConfig = useCallback(async (key: string) => {
    setEditorState(prev => ({
      ...prev,
      [key]: { ...prev[key]!, isSaving: true },
    }))
    try {
      const res = await fetch(`/api/config?key=${encodeURIComponent(key)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err as Record<string, string>).error ?? 'Failed to revert')
      }
      const data = await res.json() as { revertedTo: unknown }
      // Reset draft to the reverted default value
      const revertedText = JSON.stringify(data.revertedTo, null, 2)
      setEditorState(prev => ({
        ...prev,
        [key]: {
          ...prev[key]!,
          draftText: revertedText,
          savedText: revertedText,
          isDirty: false,
          isValidJson: true,
          parseError: null,
          isSaving: false,
        },
      }))
      setConfigs(prev => prev ? {
        ...prev,
        [key]: { value: data.revertedTo, isDefault: true },
      } : prev)
      toast.success(`Reverted "${key}" to default`, { duration: 2000 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to revert'
      toast.error(message, { duration: 3000 })
      setEditorState(prev => ({
        ...prev,
        [key]: { ...prev[key]!, isSaving: false },
      }))
    }
  }, [])

  // Reset ALL configs to defaults (POST)
  const resetAll = useCallback(async () => {
    if (!confirm('Reset ALL audit configurations to defaults? This will discard any custom overrides.')) {
      return
    }
    setIsResetting(true)
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reset' }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error((err as Record<string, string>).error ?? 'Failed to reset')
      }
      toast.success('All configs reset to defaults', { duration: 2500 })
      await fetchConfigs()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to reset'
      toast.error(message, { duration: 3000 })
    } finally {
      setIsResetting(false)
    }
  }, [fetchConfigs])

  const toggleCategory = useCallback((key: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  // Stats: count overrides
  const stats = useMemo(() => {
    if (!configs) return { total: 0, overrides: 0 }
    let overrides = 0
    for (const entry of Object.values(configs)) {
      if (!entry.isDefault) overrides += 1
    }
    return { total: Object.keys(configs).length, overrides }
  }, [configs])

  const hasDirtyConfigs = useMemo(() => {
    return Object.values(editorState).some(s => s.isDirty)
  }, [editorState])

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
      <Card className="border-2 border-cyan-500/30">
        <CardHeader>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cyan-500/20 border border-cyan-500/40 flex-shrink-0">
                <Settings2 className="h-4 w-4 text-cyan-600" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base text-cyan-800 dark:text-cyan-200">
                  Audit Configuration Editor
                </CardTitle>
                <CardDescription className="text-xs">
                  Customize severity levels, tiers, categories, statuses, and other audit taxonomy — stored in the database, with sensible defaults.
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge variant="outline" className="text-[10px] px-2 py-1">
                {stats.total} configs
              </Badge>
              {stats.overrides > 0 && (
                <Badge className="text-[10px] px-2 py-1 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                  {stats.overrides} overridden
                </Badge>
              )}
              {hasDirtyConfigs && (
                <Badge className="text-[10px] px-2 py-1 bg-orange-500/10 border border-orange-500/30 text-orange-700 dark:text-orange-300">
                  Unsaved changes
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={fetchConfigs}
                disabled={isLoading}
              >
                {isLoading
                  ? <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /> Loading</>
                  : <><RefreshCw className="h-3 w-3 mr-1" /> Reload</>}
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 border-red-500/40 text-red-700 hover:bg-red-500/10 dark:text-red-300"
                    onClick={resetAll}
                    disabled={isResetting || isLoading}
                  >
                    {isResetting
                      ? <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /> Resetting</>
                      : <><RotateCcw className="h-3 w-3 mr-1" /> Reset All</>}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reset every config to its built-in default</TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {isLoading && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <LoaderCircle className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">Loading audit configurations…</span>
            </div>
          )}

          {!isLoading && configs && (
            <>
              {CATEGORY_ORDER.map(key => {
                const entry = configs[key]
                const state = editorState[key]
                const meta = CATEGORY_META[key]
                if (!entry || !state || !meta) return null
                const Icon = meta.icon
                const isExpanded = expandedCategories.has(key)
                return (
                  <div
                    key={key}
                    className={`integration-section ${!entry.isDefault ? 'border-amber-500/40' : ''}`}
                  >
                    {/* Category header — clickable to expand/collapse */}
                    <button
                      type="button"
                      onClick={() => toggleCategory(key)}
                      className="flex items-center justify-between w-full text-left gap-2"
                      aria-expanded={isExpanded}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${meta.color}`} />
                        <span className="text-xs font-semibold text-foreground truncate">
                          {meta.label}
                        </span>
                        <code className="text-[9px] text-muted-foreground font-mono bg-muted/40 px-1 py-0.5 rounded">
                          {key}
                        </code>
                        {!entry.isDefault && (
                          <Badge className="text-[9px] px-1 py-0 bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300">
                            Override
                          </Badge>
                        )}
                        {state.isDirty && (
                          <Badge className="text-[9px] px-1 py-0 bg-orange-500/10 border border-orange-500/30 text-orange-700 dark:text-orange-300">
                            Unsaved
                          </Badge>
                        )}
                      </div>
                      {isExpanded
                        ? <ChevronUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        : <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
                    </button>

                    {/* Expanded editor */}
                    {isExpanded && (
                      <div className="mt-2 space-y-2">
                        <p className="integration-desc-block">
                          <span>{meta.description}</span>
                        </p>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                              Value (JSON)
                            </label>
                            <div className="flex items-center gap-1.5">
                              {state.isValidJson ? (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                                  <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Valid JSON
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300">
                                  <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> Invalid
                                </Badge>
                              )}
                            </div>
                          </div>
                          <Textarea
                            value={state.draftText}
                            onChange={e => updateDraft(key, e.target.value)}
                            className="text-xs font-mono min-h-[120px] max-h-[400px] custom-scrollbar"
                            spellCheck={false}
                            rows={6}
                          />
                          {state.parseError && (
                            <p className="text-[10px] text-red-600 dark:text-red-400 font-mono bg-red-500/5 border border-red-500/20 rounded p-1.5">
                              {state.parseError}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            variant="default"
                            size="sm"
                            className="text-xs h-7 bg-cyan-600 hover:bg-cyan-700 text-white"
                            onClick={() => void saveConfig(key)}
                            disabled={!state.isDirty || !state.isValidJson || state.isSaving}
                          >
                            {state.isSaving
                              ? <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /> Saving</>
                              : <><Save className="h-3 w-3 mr-1" /> Save</>}
                          </Button>
                          {!entry.isDefault && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => void revertConfig(key)}
                                  disabled={state.isSaving}
                                >
                                  {state.isSaving
                                    ? <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /></>
                                    : <><RotateCcw className="h-3 w-3 mr-1" /> Revert to Default</>}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Discard this override and restore the default value</TooltipContent>
                            </Tooltip>
                          )}
                          {state.isDirty && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => updateDraft(key, state.savedText)}
                            >
                              Discard changes
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              <Separator className="my-3" />
              <p className="text-[10px] text-muted-foreground text-center">
                Configurations are stored in the <code className="font-mono bg-muted/40 px-1 py-0.5 rounded">AuditConfig</code> table.
                Defaults are defined in <code className="font-mono bg-muted/40 px-1 py-0.5 rounded">/api/config/route.ts</code>.
                Changes take effect on next page reload (cached values in components refresh automatically).
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default AuditConfigEditor
