'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useProject } from '@/lib/project-context'
import type { AuditStatus } from './audit-types'

// Old keys to migrate from (one-time migration on first load)
const OLD_STORAGE_KEY_STATUSES = 'gsd-audit-statuses-v1'
const OLD_STORAGE_KEY_NOTES = 'gsd-audit-notes-v1'

export type StatusMap = Record<string, AuditStatus>
export type NotesMap = Record<string, string>

/** Build project-scoped localStorage key */
function projectKey(baseKey: string, activeProjectId: string | null): string {
  const suffix = activeProjectId ?? 'default'
  return `${baseKey}-${suffix}`
}

export function useAuditProgress(findingTasks: string[] = []) {
  const { activeProjectId } = useProject()
  const [statuses, setStatuses] = useState<StatusMap>({})
  const [notes, setNotes] = useState<NotesMap>({})
  const [loaded, setLoaded] = useState(false)

  const statusesKey = projectKey('audit-statuses-v1', activeProjectId)
  const notesKey = projectKey('audit-notes-v1', activeProjectId)

  // Load from localStorage on mount (deferred via rAF to satisfy lint rules)
  // Also migrates old `gsd-*` keys to new project-scoped keys
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      try {
        // ── One-time migration: move old `gsd-*` keys to project-scoped keys ──
        const oldStatuses = localStorage.getItem(OLD_STORAGE_KEY_STATUSES)
        if (oldStatuses) {
          // Migrate to the current project's key (or 'default' if no project)
          const migrateKey = projectKey('audit-statuses-v1', activeProjectId)
          if (!localStorage.getItem(migrateKey)) {
            localStorage.setItem(migrateKey, oldStatuses)
          }
          localStorage.removeItem(OLD_STORAGE_KEY_STATUSES)
        }
        const oldNotes = localStorage.getItem(OLD_STORAGE_KEY_NOTES)
        if (oldNotes) {
          const migrateKey = projectKey('audit-notes-v1', activeProjectId)
          if (!localStorage.getItem(migrateKey)) {
            localStorage.setItem(migrateKey, oldNotes)
          }
          localStorage.removeItem(OLD_STORAGE_KEY_NOTES)
        }

        // ── Load from project-scoped keys ──
        const sRaw = localStorage.getItem(statusesKey)
        if (sRaw) {
          setStatuses(JSON.parse(sRaw) as StatusMap)
        }
        const nRaw = localStorage.getItem(notesKey)
        if (nRaw) {
          setNotes(JSON.parse(nRaw) as NotesMap)
        }
      } catch {
        // ignore parse errors
      }
      setLoaded(true)
    })
    return () => cancelAnimationFrame(id)
  }, [activeProjectId, statusesKey, notesKey])

  // Persist statuses
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(statusesKey, JSON.stringify(statuses))
    } catch {
      // ignore
    }
  }, [statuses, loaded, statusesKey])

  // Persist notes
  useEffect(() => {
    if (!loaded) return
    try {
      localStorage.setItem(notesKey, JSON.stringify(notes))
    } catch {
      // ignore
    }
  }, [notes, loaded, notesKey])

  const setStatus = useCallback((task: string | number, status: AuditStatus) => {
    setStatuses(prev => ({ ...prev, [String(task)]: status }))
  }, [])

  const setNote = useCallback((task: string | number, note: string) => {
    setNotes(prev => {
      const next = { ...prev }
      if (note.trim() === '') {
        delete next[String(task)]
      } else {
        next[String(task)] = note
      }
      return next
    })
  }, [])

  const getNote = useCallback((task: string | number): string => {
    return notes[String(task)] ?? ''
  }, [notes])

  const resetAll = useCallback(() => {
    setStatuses({})
    setNotes({})
  }, [])

  /* Derived progress stats */
  const stats = useMemo(() => {
    const counts: Record<AuditStatus, number> = {
      'not-started': 0,
      'in-progress': 0,
      'fixed': 0,
      'wont-fix': 0,
    }
    findingTasks.forEach(t => {
      const s = statuses[t] ?? 'not-started'
      counts[s]++
    })
    const total = findingTasks.length
    // "Fixed" or "Won't Fix" both count as resolved
    const resolved = counts.fixed + counts['wont-fix']
    const activeProgress = counts.fixed + counts['wont-fix'] + counts['in-progress']
    const percentComplete = total > 0 ? Math.round((resolved / total) * 100) : 0
    const percentInProgress = total > 0 ? Math.round((activeProgress / total) * 100) : 0
    return {
      counts,
      total,
      resolved,
      percentComplete,
      percentInProgress,
      remaining: total - resolved,
    }
  }, [findingTasks, statuses])

  return {
    statuses,
    notes,
    loaded,
    setStatus,
    setNote,
    getNote,
    resetAll,
    stats,
  }
}
