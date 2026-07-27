'use client'

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Plus, Trash2, FolderKanban, CheckCircle2, LoaderCircle, AlertCircle, ExternalLink,
} from 'lucide-react'
import { useProject, type ProjectSummary } from '@/lib/project-context'
import { useQueryClient } from '@tanstack/react-query'

/* ── Add Project Dialog ── */

interface AddProjectForm {
  name: string
  repoOwner: string
  repoName: string
  description: string
}

function AddProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<AddProjectForm>({
    name: '',
    repoOwner: '',
    repoName: '',
    description: '',
  })
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = useCallback(() => {
    setForm({ name: '', repoOwner: '', repoName: '', description: '' })
    setError(null)
  }, [])

  const handleCreate = useCallback(async () => {
    if (!form.name.trim() || !form.repoOwner.trim() || !form.repoName.trim()) {
      setError('Name, repo owner, and repo name are required.')
      return
    }
    setIsCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          repoOwner: form.repoOwner.trim(),
          repoName: form.repoName.trim(),
          description: form.description.trim(),
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create project')
      }
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project')
    } finally {
      setIsCreating(false)
    }
  }, [form, queryClient, resetForm, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={(v) => {
      if (!v) resetForm()
      onOpenChange(v)
    }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban className="h-4 w-4" />
            Add New Project
          </DialogTitle>
          <DialogDescription>
            Create a new project with its GitHub repository. Default audit configs will be auto-seeded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="project-name" className="text-sm font-medium">Project Name *</Label>
            <Input
              id="project-name"
              placeholder="e.g. My Security Audit"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="repo-owner" className="text-sm font-medium">Repo Owner *</Label>
              <Input
                id="repo-owner"
                placeholder="e.g. octocat"
                value={form.repoOwner}
                onChange={(e) => setForm((f) => ({ ...f, repoOwner: e.target.value }))}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="repo-name" className="text-sm font-medium">Repo Name *</Label>
              <Input
                id="repo-name"
                placeholder="e.g. my-project"
                value={form.repoName}
                onChange={(e) => setForm((f) => ({ ...f, repoName: e.target.value }))}
                className="text-sm"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-desc" className="text-sm font-medium">Description</Label>
            <Textarea
              id="project-desc"
              placeholder="Optional project description..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="text-sm min-h-[60px]"
            />
          </div>
          {error && (
            <div className="p-2 rounded-md border bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isCreating}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleCreate}
            disabled={isCreating || !form.name.trim() || !form.repoOwner.trim() || !form.repoName.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {isCreating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ── Project Row ── */

function ProjectRow({
  project,
  isActiveProject,
  onSetActive,
  onDelete,
  isDeleting,
}: {
  project: ProjectSummary
  isActiveProject: boolean
  onSetActive: () => void
  onDelete: () => void
  isDeleting: boolean
}) {
  return (
    <TableRow className={isActiveProject ? 'bg-emerald-500/5' : ''}>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <span className="truncate max-w-[180px]">{project.name}</span>
          {isActiveProject && (
            <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shrink-0">
              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
              Active
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={`https://github.com/${project.repoOwner}/${project.repoName}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 underline flex items-center gap-0.5"
              >
                {project.repoOwner}/{project.repoName}
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Open on GitHub</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
          {project.findingCount}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1 justify-end">
          {!isActiveProject && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs h-7 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400"
                    onClick={onSetActive}
                  >
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Set Active
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Switch to this project</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                disabled={isDeleting}
              >
                {isDeleting ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project &ldquo;{project.name}&rdquo;?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the project and all its findings, configs, and related data.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </TableCell>
    </TableRow>
  )
}

/* ── Main Project Section ── */

export function ProjectSection() {
  const { projects, activeProjectId, setActiveProjectId, isLoading } = useProject()
  const queryClient = useQueryClient()
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = useCallback(async (projectId: string) => {
    setDeletingId(projectId)
    try {
      const res = await fetch(`/api/project?projectId=${encodeURIComponent(projectId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to delete project')
      }
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
      await queryClient.invalidateQueries({ queryKey: ['findings'] })
      await queryClient.invalidateQueries({ queryKey: ['audit-config'] })
    } catch (err) {
      console.error('Failed to delete project:', err)
    } finally {
      setDeletingId(null)
    }
  }, [queryClient])

  return (
    <motion.div
      id="admin-section-project"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <Card className="border-2 border-violet-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/40">
                <FolderKanban className="h-4 w-4 text-violet-600 dark:text-violet-300" />
              </div>
              <div>
                <CardTitle className="text-base text-violet-800 dark:text-violet-200">Project Management</CardTitle>
                <CardDescription className="text-xs">
                  Create, switch, and manage projects. Each project has its own findings, configs, and GitHub integration.
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              className="text-xs bg-violet-600 hover:bg-violet-700 text-white"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Project
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoaderCircle className="h-6 w-6 animate-spin text-violet-500" />
              <span className="ml-2 text-sm text-muted-foreground">Loading projects...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-12">
              <FolderKanban className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No projects found.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create your first project to get started.
              </p>
              <Button
                size="sm"
                className="mt-4 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                onClick={() => setAddDialogOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Project
              </Button>
            </div>
          ) : (
            <>
              {/* Mobile card view */}
              <div className="block md:hidden space-y-3">
                {projects.map((project) => {
                  const isActive = project.id === activeProjectId
                  return (
                    <div
                      key={project.id}
                      className={`rounded-lg border p-4 space-y-3 ${
                        isActive
                          ? 'border-emerald-500/40 bg-emerald-500/5'
                          : 'border-border bg-card'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm truncate">{project.name}</span>
                            {isActive && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 shrink-0">
                                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                                Active
                              </Badge>
                            )}
                          </div>
                          <a
                            href={`https://github.com/${project.repoOwner}/${project.repoName}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 underline flex items-center gap-0.5 mt-1"
                          >
                            {project.repoOwner}/{project.repoName}
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {project.findingCount} findings
                        </Badge>
                      </div>
                      {project.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
                      )}
                      <Separator />
                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7 border-emerald-500/30 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400 flex-1"
                            onClick={() => setActiveProjectId(project.id)}
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Set Active
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 border-red-500/30 text-red-600 hover:bg-red-500/10 dark:text-red-400"
                              disabled={deletingId === project.id}
                            >
                              {deletingId === project.id ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              <span className="ml-1">Delete</span>
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Project &ldquo;{project.name}&rdquo;?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete the project and all its findings, configs, and related data.
                                This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(project.id)}
                                className="bg-red-600 hover:bg-red-700 text-white"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop table view */}
              <div className="hidden md:block rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Repository</TableHead>
                      <TableHead className="text-xs text-center w-[100px]">Findings</TableHead>
                      <TableHead className="text-xs text-right w-[200px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <ProjectRow
                        key={project.id}
                        project={project}
                        isActiveProject={project.id === activeProjectId}
                        onSetActive={() => setActiveProjectId(project.id)}
                        onDelete={() => handleDelete(project.id)}
                        isDeleting={deletingId === project.id}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Summary footer */}
              <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
                <span>{projects.length} project{projects.length !== 1 ? 's' : ''} total</span>
                {activeProjectId && (
                  <span className="flex items-center gap-1">
                    Active: <strong className="text-foreground">{projects.find(p => p.id === activeProjectId)?.name}</strong>
                  </span>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Add Project Dialog */}
      <AddProjectDialog open={addDialogOpen} onOpenChange={setAddDialogOpen} />
    </motion.div>
  )
}
