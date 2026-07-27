'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Button,
} from '@/components/ui/button'
import {
  Badge,
} from '@/components/ui/badge'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Clock, History, X, Download, Trash2, ChevronRight,
  ShieldAlert, StickyNote, Bookmark, Rocket, Filter,
  BrainCircuit, FileJson,
} from 'lucide-react'
import {
  type ActivityEntry, type ActivityType,
  getActivityLog, clearActivityLog, exportActivityLog,
} from '@/lib/use-findings'

/* ─── Icon + color per activity type ─── */
const typeConfig: Record<ActivityType, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  status_change: { icon: ShieldAlert, color: 'text-emerald-600', bg: 'bg-emerald-500/10', label: 'Status Change' },
  note_save: { icon: StickyNote, color: 'text-amber-600', bg: 'bg-amber-500/10', label: 'Note Saved' },
  bookmark: { icon: Bookmark, color: 'text-orange-600', bg: 'bg-orange-500/10', label: 'Bookmark' },
  issue_create: { icon: Rocket, color: 'text-teal-600', bg: 'bg-teal-500/10', label: 'Issue Created' },
  filter_change: { icon: Filter, color: 'text-violet-600', bg: 'bg-violet-500/10', label: 'Filter Change' },
  ai_analysis: { icon: BrainCircuit, color: 'text-teal-700', bg: 'bg-teal-500/10', label: 'AI Analysis' },
  export: { icon: FileJson, color: 'text-sky-600', bg: 'bg-sky-500/10', label: 'Export' },
}

/* ─── Single log entry row ─── */
function LogEntryRow({ entry }: { entry: ActivityEntry }) {
  const cfg = typeConfig[entry.type] ?? typeConfig.filter_change
  const Icon = cfg.icon

  return (
    <div className="flex items-start gap-2 py-1.5 text-xs border-b border-border/50 last:border-0">
      <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${cfg.bg}`}>
        <Icon className={`h-3 w-3 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
            {cfg.label}
          </Badge>
          {entry.task && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 font-mono">
              Task {entry.task}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground leading-relaxed mt-0.5 line-clamp-2">
          {entry.description}
        </p>
      </div>
      <div className="flex-shrink-0 text-[10px] text-muted-foreground/70 whitespace-nowrap">
        {formatTimestamp(entry.timestamp)}
      </div>
    </div>
  )
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ts
  }
}

/* ─── Activity Log Panel ─── */
export function ActivityLog() {
  const [isOpen, setIsOpen] = useState(false)
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)

  // Load entries on mount
  useEffect(() => {
    requestAnimationFrame(() => setEntries(getActivityLog()))
  }, [])

  // Refresh entries when panel opens
  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => {
        setEntries(getActivityLog())
        setUnreadCount(0)
      })
    }
  }, [isOpen])

  // Poll for new entries periodically (to catch changes from other actions)
  useEffect(() => {
    const interval = setInterval(() => {
      const current = getActivityLog()
      if (!isOpen && current.length > entries.length) {
        setUnreadCount(current.length - entries.length)
      }
      requestAnimationFrame(() => setEntries(current))
    }, 3000)
    return () => clearInterval(interval)
  }, [isOpen, entries.length])

  const handleClear = useCallback(() => {
    clearActivityLog()
    setEntries([])
  }, [])

  const handleExport = useCallback(() => {
    const data = exportActivityLog()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `activity-log-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return (
    <>
      {/* Floating toggle button */}
      <motion.div
        className="fixed bottom-4 right-4 z-40 no-print"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.5, type: 'spring' }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`h-10 w-10 rounded-full shadow-lg backdrop-blur-md border-2 transition-all ${
                  isOpen
                    ? 'bg-teal-600 text-white border-teal-500 shadow-teal-500/20'
                    : 'bg-background/80 border-border hover:border-teal-500/50 hover:bg-teal-500/10'
                }`}
                onClick={() => setIsOpen(!isOpen)}
              >
                <History className="h-4 w-4" />
                {unreadCount > 0 && !isOpen && (
                  <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1 animate-pulse">
                    {unreadCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Activity Log</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </motion.div>

      {/* Expandable panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-16 right-4 z-40 no-print w-80 sm:w-96"
          >
            <div className="rounded-lg border shadow-xl backdrop-blur-md bg-background/95 border-teal-500/20 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b bg-teal-500/5">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-teal-600" />
                  <h3 className="text-sm font-semibold text-teal-700 dark:text-teal-300">Activity Log</h3>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                    {entries.length} entries
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={handleExport}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Export as JSON</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 hover:text-red-600"
                          onClick={handleClear}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Clear log</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Entries list */}
              <div className="max-h-96 overflow-y-auto p-3 custom-scrollbar">
                {entries.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-xs">No activity recorded yet.</p>
                    <p className="text-[10px] opacity-70 mt-1">
                      Actions like status changes, bookmarks, and AI analyses will be logged here.
                    </p>
                  </div>
                ) : (
                  entries.map(entry => (
                    <LogEntryRow key={entry.id} entry={entry} />
                  ))
                )}
              </div>

              {/* Footer hint */}
              <div className="p-2 border-t text-[10px] text-center text-muted-foreground/60">
                Persisted to localStorage · Max 100 entries · Auto-pruned
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
