'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Star, Bookmark, Save, Trash2, Check, Plus, X,
} from 'lucide-react'
import { toast } from 'sonner'

/* ─── PRESET DATA STRUCTURE ─── */
export interface FilterPreset {
  id: string
  name: string
  search: string
  severityFilter: string
  verificationFilter: string
  categoryFilter: string
  statusFilter: string
  showBookmarkedOnly: boolean
  isBuiltIn: boolean
  createdAt: string
}

/* ─── BUILT-IN PRESETS ─── */
export const BUILT_IN_PRESETS: FilterPreset[] = [
  {
    id: 'preset-critical-only',
    name: 'Critical Only',
    search: '',
    severityFilter: 'critical',
    verificationFilter: 'all',
    categoryFilter: 'all',
    statusFilter: 'all',
    showBookmarkedOnly: false,
    isBuiltIn: true,
    createdAt: '2025-01-01',
  },
  {
    id: 'preset-ready-to-fix',
    name: 'Ready to Fix',
    search: '',
    severityFilter: 'all',
    verificationFilter: 'all',
    categoryFilter: 'all',
    statusFilter: 'not-started',
    showBookmarkedOnly: false,
    isBuiltIn: true,
    createdAt: '2025-01-01',
  },
  {
    id: 'preset-in-progress',
    name: 'In Progress',
    search: '',
    severityFilter: 'all',
    verificationFilter: 'all',
    categoryFilter: 'all',
    statusFilter: 'in-progress',
    showBookmarkedOnly: false,
    isBuiltIn: true,
    createdAt: '2025-01-01',
  },
]

export const FILTER_PRESETS_STORAGE_KEY = 'audit-filter-presets'

/* ─── FILTER PRESETS COMPONENT ─── */
export interface FilterPresetsProps {
  search: string
  severityFilter: string
  verificationFilter: string
  categoryFilter: string
  statusFilter: string
  showBookmarkedOnly: boolean
  onSearchChange: (v: string) => void
  onSeverityFilterChange: (v: string) => void
  onVerificationFilterChange: (v: string) => void
  onCategoryFilterChange: (v: string) => void
  onStatusFilterChange: (v: string) => void
  onShowBookmarkedOnlyChange: (v: boolean) => void
  activePresetName?: string | null
  onActivePresetNameChange?: (name: string | null) => void
}

export function FilterPresets({
  search,
  severityFilter,
  verificationFilter,
  categoryFilter,
  statusFilter,
  showBookmarkedOnly,
  onSearchChange,
  onSeverityFilterChange,
  onVerificationFilterChange,
  onCategoryFilterChange,
  onStatusFilterChange,
  onShowBookmarkedOnlyChange,
  activePresetName,
  onActivePresetNameChange,
}: FilterPresetsProps) {
  const [customPresets, setCustomPresets] = useState<FilterPreset[]>([])
  const [savingMode, setSavingMode] = useState(false)
  const [presetNameInput, setPresetNameInput] = useState('')
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Load custom presets from localStorage on mount
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        const stored = localStorage.getItem(FILTER_PRESETS_STORAGE_KEY)
        if (stored) {
          const parsed = JSON.parse(stored) as FilterPreset[]
          setCustomPresets(parsed.filter(p => !p.isBuiltIn))
        }
      } catch { /* ignore */ }
    })
    return () => cancelAnimationFrame(id)
  }, [])

  // Save custom presets to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, JSON.stringify(customPresets))
    } catch { /* ignore */ }
  }, [customPresets])

  // Focus input when entering save mode
  useEffect(() => {
    if (savingMode && inputRef.current) {
      inputRef.current.focus()
    }
  }, [savingMode])

  const applyPreset = useCallback((preset: FilterPreset) => {
    onSearchChange(preset.search)
    onSeverityFilterChange(preset.severityFilter)
    onVerificationFilterChange(preset.verificationFilter)
    onCategoryFilterChange(preset.categoryFilter)
    onStatusFilterChange(preset.statusFilter)
    onShowBookmarkedOnlyChange(preset.showBookmarkedOnly)
    onActivePresetNameChange?.(preset.name)
    setDropdownOpen(false)
    toast.success(`Applied preset: ${preset.name}`, { duration: 2000 })
  }, [
    onSearchChange, onSeverityFilterChange, onVerificationFilterChange,
    onCategoryFilterChange, onStatusFilterChange, onShowBookmarkedOnlyChange,
    onActivePresetNameChange,
  ])

  const saveCurrentFilters = useCallback(() => {
    if (!presetNameInput.trim()) return

    const newPreset: FilterPreset = {
      id: `preset-custom-${Date.now()}`,
      name: presetNameInput.trim(),
      search,
      severityFilter,
      verificationFilter,
      categoryFilter,
      statusFilter,
      showBookmarkedOnly,
      isBuiltIn: false,
      createdAt: new Date().toISOString(),
    }

    setCustomPresets(prev => [...prev, newPreset])
    setPresetNameInput('')
    setSavingMode(false)
    setDropdownOpen(false)
    onActivePresetNameChange?.(newPreset.name)
    toast.success(`Saved preset: ${newPreset.name}`, { duration: 2000 })
  }, [
    presetNameInput, search, severityFilter, verificationFilter,
    categoryFilter, statusFilter, showBookmarkedOnly, onActivePresetNameChange,
  ])

  const deletePreset = useCallback((presetId: string) => {
    setCustomPresets(prev => prev.filter(p => p.id !== presetId))
    if (activePresetName) {
      // Check if the deleted preset was the active one
      const deleted = customPresets.find(p => p.id === presetId)
      if (deleted && deleted.name === activePresetName) {
        onActivePresetNameChange?.(null)
      }
    }
    toast.info('Preset deleted', { duration: 1500 })
  }, [activePresetName, customPresets, onActivePresetNameChange])

  const allPresets = [...BUILT_IN_PRESETS, ...customPresets]

  // Check if current filters match any preset
  const matchingPreset = allPresets.find(p =>
    p.search === search &&
    p.severityFilter === severityFilter &&
    p.verificationFilter === verificationFilter &&
    p.categoryFilter === categoryFilter &&
    p.statusFilter === statusFilter &&
    p.showBookmarkedOnly === showBookmarkedOnly
  )

  return (
    <div className="flex items-center gap-2">
      {/* Active preset indicator */}
      <AnimatePresence>
        {activePresetName && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="flex items-center gap-1"
          >
            <Badge variant="outline" className="text-xs px-2 py-0.5 border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              <Star className="h-3 w-3 mr-0.5" />
              {activePresetName}
            </Badge>
            <button
              onClick={() => onActivePresetNameChange?.(null)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Clear active preset"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Presets dropdown */}
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={matchingPreset ? 'default' : 'outline'}
            size="sm"
            className="h-8 gap-1"
            aria-label="Filter presets"
          >
            <Star className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Presets</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {/* Built-in presets */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Built-in Presets
          </DropdownMenuLabel>
          <DropdownMenuGroup>
            {BUILT_IN_PRESETS.map(preset => (
              <DropdownMenuItem
                key={preset.id}
                onClick={() => applyPreset(preset)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Star className="h-3.5 w-3.5 text-emerald-600" />
                <span className="flex-1">{preset.name}</span>
                {matchingPreset?.id === preset.id && (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>

          {/* Custom presets */}
          {customPresets.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Custom Presets
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                {customPresets.map(preset => (
                  <DropdownMenuItem
                    key={preset.id}
                    onClick={() => applyPreset(preset)}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Bookmark className="h-3.5 w-3.5 text-amber-600" />
                    <span className="flex-1">{preset.name}</span>
                    {matchingPreset?.id === preset.id && (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deletePreset(preset.id)
                      }}
                      className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                      aria-label={`Delete preset ${preset.name}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}

          {/* Save current filters */}
          <DropdownMenuSeparator />
          {!savingMode ? (
            <DropdownMenuItem
              onClick={() => {
                setSavingMode(true)
                setPresetNameInput('')
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Save Current Filters</span>
            </DropdownMenuItem>
          ) : (
            <div className="p-2 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={presetNameInput}
                  onChange={(e) => setPresetNameInput(e.target.value)}
                  placeholder="Preset name..."
                  className="h-7 text-xs"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveCurrentFilters()
                    if (e.key === 'Escape') {
                      setSavingMode(false)
                      setPresetNameInput('')
                    }
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={saveCurrentFilters}
                  disabled={!presetNameInput.trim()}
                  aria-label="Save preset"
                >
                  <Save className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setSavingMode(false)
                    setPresetNameInput('')
                  }}
                  aria-label="Cancel saving preset"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
