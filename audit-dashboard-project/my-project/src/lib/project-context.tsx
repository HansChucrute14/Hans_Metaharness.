'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// ── Types ──

export interface ProjectSummary {
  id: string
  name: string
  description: string
  repoOwner: string
  repoName: string
  isActive: boolean
  findingCount: number
}

interface ProjectListResponse {
  projects: ProjectSummary[]
  activeProjectId: string | null
}

interface ProjectContextValue {
  activeProjectId: string | null
  setActiveProjectId: (id: string) => void
  projects: ProjectSummary[]
  activeProject: ProjectSummary | null
  isLoading: boolean
}

// ── Context ──

const ProjectContext = createContext<ProjectContextValue | null>(null)

// ── Provider ──

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null)

  // Fetch project list
  const { data, isLoading } = useQuery<ProjectListResponse>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/project')
      if (!res.ok) throw new Error('Failed to fetch projects')
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
  })

  // Initialize activeProjectId from API response
  if (data?.activeProjectId && !activeProjectId) {
    setActiveProjectIdState(data.activeProjectId)
  }

  // localStorage migration: on mount, migrate old gsd-* keys to new project-scoped keys
  // The new keys are scoped by projectId so each project gets its own storage.
  // The migration target 'default' below matches the activeProjectId at the time
  // of migration — the actual project-scoped keys are computed dynamically by
  // the hooks in use-audit-progress.ts and use-findings.ts.
  useEffect(() => {
    const MIGRATION_MAP: Record<string, string> = {
      'gsd-audit-statuses-v1': 'audit-statuses-v1-default',
      'gsd-audit-notes-v1': 'audit-notes-v1-default',
      'gsd-activity-log': 'activity-log-default',
    }

    for (const [oldKey, newKey] of Object.entries(MIGRATION_MAP)) {
      const oldValue = localStorage.getItem(oldKey)
      if (oldValue !== null) {
        // Only migrate if new key doesn't already exist (prevent overwrite)
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, oldValue)
        }
        // Remove old key after successful migration
        localStorage.removeItem(oldKey)
      }
    }
  }, []) // Run once on mount

  const projects = data?.projects ?? []

  const activeProject = projects.find(p => p.id === activeProjectId) ?? null

  // Mutation to set active project → PUT /api/project
  const setActiveMutation = useMutation({
    mutationFn: async (projectId: string) => {
      const res = await fetch('/api/project', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      if (!res.ok) throw new Error('Failed to set active project')
      return res.json()
    },
    onSuccess: () => {
      // Invalidate queries that depend on the active project
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['audit-config'] })
      queryClient.invalidateQueries({ queryKey: ['findings'] })
    },
  })

  const setActiveProjectId = useCallback((id: string) => {
    // Clear entire cache on project switch to prevent stale data from previous project
    // briefly appearing during refetch (race condition fix from blueprint Step 5)
    queryClient.clear()
    setActiveProjectIdState(id)
    setActiveMutation.mutate(id)
  }, [setActiveMutation, queryClient])

  return (
    <ProjectContext.Provider value={{
      activeProjectId,
      setActiveProjectId,
      projects,
      activeProject,
      isLoading,
    }}>
      {children}
    </ProjectContext.Provider>
  )
}

// ── Hook ──

export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext)
  if (!ctx) {
    throw new Error('useProject must be used within a ProjectProvider')
  }
  return ctx
}
