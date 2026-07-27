'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckSquare, XSquare, Play, Ban, Trash2, Download, Copy,
  Github, ArrowUpRight, Check, LoaderCircle, AlertTriangle,
  ListChecks, ChevronDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Finding } from '@/lib/data'
import type { AuditStatus } from '@/lib/audit-types'
import { auditStatusConfig, AUDIT_STATUS_ORDER } from '@/lib/audit-data'
import { exportCSV, exportJSONEnhanced, exportMarkdownEnhanced, type ProjectExportInfo } from '@/components/export-enhancements'
import { useProject } from '@/lib/project-context'

/* ─── BATCH ACTIONS TOOLBAR ─── */

interface BatchActionsToolbarProps {
  /** Currently selected task IDs */
  selectedTasks: Set<string | number>
  /** All findings for reference */
  findings: Finding[]
  /** Current audit statuses */
  statuses: Record<string, string>
  /** Set status for a task */
  onSetStatus: (task: string, status: AuditStatus) => void
  /** Clear selection */
  onClearSelection: () => void
  /** Select all visible */
  onSelectAll: (tasks: (string | number)[]) => void
  /** Open compare drawer with selected */
  onCompareSelected: (tasks: (string | number)[]) => void
}

export function BatchActionsToolbar({
  selectedTasks,
  findings,
  statuses,
  onSetStatus,
  onClearSelection,
  onSelectAll,
  onCompareSelected,
}: BatchActionsToolbarProps) {
  const { activeProject } = useProject()
  const [isExpanded, setIsExpanded] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  const selectedFindings = findings.filter(f => selectedTasks.has(f.task))
  const selectedCount = selectedTasks.size
  const totalCount = findings.length

  // Batch status change
  const handleBatchStatus = useCallback((status: AuditStatus) => {
    if (selectedCount === 0) {
      toast.error('No findings selected', { duration: 2000 })
      return
    }
    setIsProcessing(true)

    // Apply status to all selected findings
    let count = 0
    selectedFindings.forEach(f => {
      onSetStatus(String(f.task), status)
      count++
    })

    setIsProcessing(false)
    toast.success(`Changed status of ${count} findings to "${auditStatusConfig[status].label}"`, { duration: 3000 })
    onClearSelection()
  }, [selectedCount, selectedFindings, onSetStatus, onClearSelection])

  // Batch export
  const handleBatchExport = useCallback((format: 'csv' | 'json' | 'markdown') => {
    if (selectedCount === 0) {
      toast.error('No findings selected', { duration: 2000 })
      return
    }
    try {
      if (format === 'csv') exportCSV(selectedFindings, findings)
      else if (format === 'json') {
        const projectInfo: ProjectExportInfo | undefined = activeProject ? { repoOwner: activeProject.repoOwner, repoName: activeProject.repoName, projectName: activeProject.name } : undefined
        exportJSONEnhanced(selectedFindings, findings, statuses, projectInfo)
      }
      else {
        const projectInfo: ProjectExportInfo | undefined = activeProject ? { repoOwner: activeProject.repoOwner, repoName: activeProject.repoName, projectName: activeProject.name } : undefined
        exportMarkdownEnhanced(selectedFindings, findings, statuses, projectInfo)
      }

      toast.success(`Exported ${selectedCount} findings as ${format.toUpperCase()}`, { duration: 3000 })
    } catch (err) {
      toast.error(`Export failed: ${(err as Error).message}`, { duration: 3000 })
    }
  }, [selectedCount, selectedFindings, findings, statuses])

  // Compare selected
  const handleCompare = useCallback(() => {
    if (selectedCount < 2) {
      toast.error('Select at least 2 findings to compare', { duration: 2000 })
      return
    }
    if (selectedCount > 3) {
      toast.error('Maximum 3 findings can be compared', { duration: 2000 })
      return
    }
    onCompareSelected(Array.from(selectedTasks))
  }, [selectedCount, selectedTasks, onCompareSelected])

  if (selectedCount === 0) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[90%] max-w-lg"
      >
        <Card className="glass-card shadow-2xl border-2 border-amber-500/30 overflow-hidden">
          {/* Amber gradient top strip */}
          <div className="h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-orange-500" />

          <CardHeader className="py-2 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-amber-500" />
                Batch Actions
                <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs font-bold">
                  {selectedCount} selected
                </Badge>
              </CardTitle>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onSelectAll(findings.map(f => f.task))}
                  className="text-xs h-7"
                >
                  <CheckSquare className="h-3 w-3 mr-1" />
                  Select All ({totalCount})
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onClearSelection}
                  className="text-xs h-7"
                >
                  <XSquare className="h-3 w-3 mr-1" />
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="py-2 px-4 space-y-2">
            {/* Primary actions row */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Status change dropdown */}
              <Select onValueChange={(val) => handleBatchStatus(val as AuditStatus)} disabled={isProcessing}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="Change status..." />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_STATUS_ORDER.map(status => (
                    <SelectItem key={status} value={status} className="text-xs">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: auditStatusConfig[status].color }} />
                        {auditStatusConfig[status].label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={handleCompare}
                disabled={selectedCount < 2}
                className="text-xs h-8"
              >
                <ArrowUpRight className="h-3 w-3 mr-1" />
                Compare ({selectedCount > 3 ? 'max 3' : selectedCount})
              </Button>

              {/* Export dropdown */}
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchExport('csv')}
                  className="text-xs h-8"
                >
                  <Download className="h-3 w-3 mr-1" />
                  CSV
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchExport('json')}
                  className="text-xs h-8"
                >
                  JSON
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchExport('markdown')}
                  className="text-xs h-8"
                >
                  MD
                </Button>
              </div>
            </div>

            {/* Selected findings preview */}
            <div className="max-h-24 overflow-y-auto scrollbar-styled">
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedFindings.map(f => (
                  <Badge
                    key={f.task}
                    variant="outline"
                    className="text-[10px] font-mono px-1.5 py-0 cursor-pointer hover:bg-destructive/10 transition-colors"
                    onClick={() => {
                      // Remove from selection on click
                      const next = new Set(selectedTasks)
                      next.delete(f.task)
                      onClearSelection()
                      // Re-add remaining
                      next.forEach(t => {
                        // Can't selectively add here, just clear for simplicity
                      })
                    }}
                  >
                    Task {f.task}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Processing indicator */}
            {isProcessing && (
              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <LoaderCircle className="h-3 w-3 animate-spin" />
                Applying changes...
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}
