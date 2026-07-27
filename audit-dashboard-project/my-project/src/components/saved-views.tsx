'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Bookmark,
  Save,
  Trash2,
  Eye,
  Download,
  Upload,
  Star,
  X,
  Plus,
  Clock,
  Layers,
} from 'lucide-react'
import { toast } from 'sonner'

/* ─── TYPES ─── */
export interface SavedViewFilters {
  search: string
  severityFilter: string
  verificationFilter: string
  categoryFilter: string
  statusFilter: string
  sortBy: string
}

export interface SavedView extends SavedViewFilters {
  id: string
  name: string
  createdAt: string
  lastAppliedAt: string | null
}

export interface SavedViewsDialogProps {
  currentFilters: SavedViewFilters
  onApplyView: (filters: SavedViewFilters) => void
  open: boolean
  onOpenChange: (open: boolean) => void
}

export interface SavedViewsButtonProps {
  currentFilters: SavedViewFilters
  onApplyView: (filters: SavedViewFilters) => void
}

/* ─── CONSTANTS ─── */
const STORAGE_KEY = 'saved-views'

/* ─── HELPERS ─── */
export function getSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SavedView[]
    if (!Array.isArray(parsed)) return []
    return parsed
  } catch {
    return []
  }
}

function persistViews(views: SavedView[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(views))
  } catch {
    /* ignore quota errors */
  }
}

export function saveView(name: string, filters: SavedViewFilters): SavedView {
  const trimmedName = name.trim()
  if (!trimmedName) {
    throw new Error('View name cannot be empty')
  }
  const views = getSavedViews()
  // Prevent duplicate names (case-insensitive) by overwriting the existing one
  const filtered = views.filter(v => v.name.toLowerCase() !== trimmedName.toLowerCase())
  const newView: SavedView = {
    id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    createdAt: new Date().toISOString(),
    lastAppliedAt: null,
    ...filters,
  }
  const next = [...filtered, newView]
  persistViews(next)
  return newView
}

export function deleteView(viewId: string): void {
  const views = getSavedViews()
  const next = views.filter(v => v.id !== viewId)
  persistViews(next)
}

export function updateViewAppliedTimestamp(viewId: string): void {
  const views = getSavedViews()
  const next = views.map(v =>
    v.id === viewId ? { ...v, lastAppliedAt: new Date().toISOString() } : v
  )
  persistViews(next)
}

export function exportViews(views: SavedView[]): string {
  return JSON.stringify(views, null, 2)
}

export function importViews(jsonString: string): SavedView[] {
  const parsed = JSON.parse(jsonString) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid JSON: expected an array of saved views')
  }
  // Light validation — make sure each entry has at least id + name
  const valid = (parsed as SavedView[]).filter(
    v => v && typeof v === 'object' && typeof v.name === 'string'
  )
  if (valid.length === 0) {
    throw new Error('No valid saved views found in JSON')
  }
  // Merge with existing views, deduplicating by name (case-insensitive)
  const existing = getSavedViews()
  const existingNames = new Set(existing.map(v => v.name.toLowerCase()))
  const toAdd = valid
    .filter(v => !existingNames.has(v.name.toLowerCase()))
    .map(v => ({
      id: v.id || `view-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: v.name,
      createdAt: v.createdAt ?? new Date().toISOString(),
      lastAppliedAt: v.lastAppliedAt ?? null,
      search: v.search ?? '',
      severityFilter: v.severityFilter ?? 'all',
      verificationFilter: v.verificationFilter ?? 'all',
      categoryFilter: v.categoryFilter ?? 'all',
      statusFilter: v.statusFilter ?? 'all',
      sortBy: v.sortBy ?? 'tier',
    }))
  const next = [...existing, ...toAdd]
  persistViews(next)
  return toAdd
}

/* ─── SMALL UI HELPERS ─── */
function formatTimestamp(ts: string | null): string {
  if (!ts) return 'never'
  try {
    const d = new Date(ts)
    const now = Date.now()
    const diffMs = now - d.getTime()
    const diffMin = Math.floor(diffMs / (60 * 1000))
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    return `${diffDay}d ago`
  } catch {
    return 'unknown'
  }
}

function describeFilters(filters: SavedViewFilters): string {
  const parts: string[] = []
  if (filters.search.trim()) parts.push(`"${filters.search.trim()}"`)
  if (filters.severityFilter !== 'all') parts.push(`sev:${filters.severityFilter}`)
  if (filters.verificationFilter !== 'all') parts.push(`ver:${filters.verificationFilter}`)
  if (filters.categoryFilter !== 'all') parts.push(`cat:${filters.categoryFilter}`)
  if (filters.statusFilter !== 'all') parts.push(`st:${filters.statusFilter}`)
  if (filters.sortBy !== 'tier') parts.push(`sort:${filters.sortBy}`)
  return parts.length > 0 ? parts.join(' · ') : 'No filters (all findings)'
}

/* ─── MAIN DIALOG ─── */
export function SavedViewsDialog({
  currentFilters,
  onApplyView,
  open,
  onOpenChange,
}: SavedViewsDialogProps) {
  const [views, setViews] = useState<SavedView[]>([])
  const [newViewName, setNewViewName] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load views from localStorage when dialog opens
  useEffect(() => {
    if (open) {
      const id = requestAnimationFrame(() => setViews(getSavedViews()))
      return () => cancelAnimationFrame(id)
    }
  }, [open])

  const handleSave = useCallback(() => {
    const trimmed = newViewName.trim()
    if (!trimmed) {
      toast.error('Please enter a view name', { duration: 2000 })
      return
    }
    try {
      const saved = saveView(trimmed, currentFilters)
      setViews(getSavedViews())
      setNewViewName('')
      toast.success(`Saved view: ${saved.name}`, { duration: 2000 })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save view'
      toast.error(msg, { duration: 2500 })
    }
  }, [newViewName, currentFilters])

  const handleApply = useCallback(
    (view: SavedView) => {
      onApplyView({
        search: view.search,
        severityFilter: view.severityFilter,
        verificationFilter: view.verificationFilter,
        categoryFilter: view.categoryFilter,
        statusFilter: view.statusFilter,
        sortBy: view.sortBy,
      })
      updateViewAppliedTimestamp(view.id)
      setViews(getSavedViews())
      onOpenChange(false)
      toast.success(`Applied view: ${view.name}`, { duration: 2000 })
    },
    [onApplyView, onOpenChange]
  )

  const handleDelete = useCallback((viewId: string) => {
    const view = views.find(v => v.id === viewId)
    deleteView(viewId)
    setViews(getSavedViews())
    setConfirmDeleteId(null)
    if (view) {
      toast.info(`Deleted view: ${view.name}`, { duration: 2000 })
    }
  }, [views])

  const handleExport = useCallback(() => {
    if (views.length === 0) {
      toast.error('No views to export', { duration: 2000 })
      return
    }
    const data = exportViews(views)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `saved-views-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${views.length} view(s)`, { duration: 2000 })
  }, [views])

  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImportFile = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = e => {
        try {
          const text = String(e.target?.result ?? '')
          const added = importViews(text)
          setViews(getSavedViews())
          toast.success(
            `Imported ${added.length} view(s)${
              added.length === 0 ? ' (all were duplicates)' : ''
            }`,
            { duration: 2500 }
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to import views'
          toast.error(msg, { duration: 2500 })
        }
      }
      reader.readAsText(file)
      // Reset input so the same file can be re-selected
      event.target.value = ''
    },
    []
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-violet-600" />
            Saved Views
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {views.length} saved
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Save and recall combinations of filters. Stored locally in your browser.
          </DialogDescription>
        </DialogHeader>

        {/* Save current filters form */}
        <div className="border rounded-md p-3 bg-muted/30 space-y-2">
          <label className="text-xs font-medium text-foreground flex items-center gap-1">
            <Plus className="h-3 w-3" /> Save current filters as a new view
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={newViewName}
              onChange={e => setNewViewName(e.target.value)}
              placeholder="View name (e.g. Critical + Tier 0 + Not Started)"
              className="h-8 text-sm"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSave()
                }
              }}
              aria-label="New view name"
            />
            <Button
              onClick={handleSave}
              size="sm"
              className="h-8 gap-1"
              disabled={!newViewName.trim()}
            >
              <Save className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground/80 leading-snug">
            <span className="font-medium">Current filters:</span>{' '}
            {describeFilters(currentFilters)}
          </div>
        </div>

        {/* Saved views list */}
        <div className="flex-1 overflow-y-auto custom-scrollbar min-h-0 -mx-1 px-1">
          {views.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Star className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No saved views yet.</p>
              <p className="text-xs opacity-70 mt-1">
                Save your frequently-used filter combinations above for one-click access.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {views.map(view => (
                  <motion.li
                    key={view.id}
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -8 }}
                    transition={{ duration: 0.15 }}
                    className="border rounded-md p-3 bg-card hover:border-violet-500/40 hover:bg-violet-500/5 transition-colors group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Bookmark className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
                          <span className="text-sm font-medium truncate">
                            {view.name}
                          </span>
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            Applied {formatTimestamp(view.lastAppliedAt)}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                          {describeFilters(view)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 hover:bg-violet-500/15 hover:text-violet-700"
                          onClick={() => handleApply(view)}
                          aria-label={`Apply view ${view.name}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {confirmDeleteId === view.id ? (
                          <div className="flex items-center gap-1 bg-red-500/10 rounded-md px-1">
                            <button
                              className="text-[10px] font-semibold text-red-600 hover:text-red-700 px-1 py-1"
                              onClick={() => handleDelete(view.id)}
                              aria-label="Confirm delete"
                            >
                              Confirm
                            </button>
                            <button
                              className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-1"
                              onClick={() => setConfirmDeleteId(null)}
                              aria-label="Cancel delete"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 hover:bg-red-500/15 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => setConfirmDeleteId(view.id)}
                            aria-label={`Delete view ${view.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </div>

        <DialogFooter className="border-t pt-3 flex-row sm:justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={views.length === 0}
              className="gap-1"
            >
              <Download className="h-3.5 w-3.5" /> Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleImportClick}
              className="gap-1"
            >
              <Upload className="h-3.5 w-3.5" /> Import
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
              aria-hidden="true"
            />
          </div>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ─── BUTTON TRIGGER WRAPPER ─── */
export function SavedViewsButton({
  currentFilters,
  onApplyView,
}: SavedViewsButtonProps) {
  const [open, setOpen] = useState(false)
  const [viewCount, setViewCount] = useState(0)

  useEffect(() => {
    // Load view count on mount (and periodically when closed)
    const refresh = () => setViewCount(getSavedViews().length)
    refresh()
    const interval = setInterval(refresh, 5000)
    return () => clearInterval(interval)
  }, [])

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="h-8 gap-1"
        onClick={() => setOpen(true)}
        aria-label="Open saved views dialog"
      >
        <Layers className="h-3.5 w-3.5 text-violet-600" />
        <span className="hidden sm:inline">Saved Views</span>
        {viewCount > 0 && (
          <Badge
            variant="secondary"
            className="ml-1 text-[9px] px-1 py-0 h-4 min-w-4 flex items-center justify-center"
          >
            {viewCount}
          </Badge>
        )}
      </Button>
      <SavedViewsDialog
        currentFilters={currentFilters}
        onApplyView={onApplyView}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
