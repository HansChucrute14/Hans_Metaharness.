'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import {
  Alert, AlertDescription, AlertTitle,
} from '@/components/ui/alert'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Github, RefreshCw, ArrowDownToLine, ArrowUpFromLine, AlertCircle,
  CheckCircle2, LoaderCircle, GitBranch, ExternalLink, ArrowRightLeft,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import {
  useGitHubPullSync, useGitHubPushSync,
  type GitHubSyncResult, type GitHubPushResult,
  addActivityEntry,
} from '@/lib/use-findings'
import { toast } from 'sonner'

/* ─── Main Panel ─── */
export function GitHubSyncPanel() {
  const [pullResult, setPullResult] = useState<GitHubSyncResult | null>(null)
  const [pushResult, setPushResult] = useState<GitHubPushResult | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  const pullSync = useGitHubPullSync()
  const pushSync = useGitHubPushSync()

  const handlePullSync = useCallback(() => {
    pullSync.mutate(undefined, {
      onSuccess: (data) => {
        setPullResult(data)
        toast.success(
          `Synced ${data.summary.syncedFindings} findings from GitHub`,
          { duration: 3000 }
        )
        addActivityEntry({
          type: 'github_sync',
          description: `Pull sync: ${data.summary.syncedFindings} findings updated from GitHub. ${data.summary.unmatchedIssues} unmatched issues, ${data.summary.findingsWithoutIssues} findings without issues.`,
        })
      },
      onError: (err) => {
        toast.error(`Sync failed: ${err.message}`, { duration: 3000 })
      },
    })
  }, [pullSync])

  const handlePushCreate = useCallback(() => {
    pushSync.mutate(
      { tasks: ['all'], action: 'create-issue' },
      {
        onSuccess: (data) => {
          setPushResult(data)
          toast.success(
            `Created ${data.summary.success} GitHub issues`,
            { duration: 3000 }
          )
          addActivityEntry({
            type: 'github_sync',
            description: `Push sync: Created ${data.summary.success} GitHub issues from findings`,
          })
        },
        onError: (err) => {
          toast.error(`Push failed: ${err.message}`, { duration: 3000 })
        },
      },
    )
  }, [pushSync])

  const handlePushStatus = useCallback(() => {
    pushSync.mutate(
      { tasks: ['all'], action: 'update-status' },
      {
        onSuccess: (data) => {
          setPushResult(data)
          toast.success(
            `Updated ${data.summary.success} GitHub issue statuses`,
            { duration: 3000 }
          )
          addActivityEntry({
            type: 'github_sync',
            description: `Push sync: Updated ${data.summary.success} GitHub issue statuses`,
          })
        },
        onError: (err) => {
          toast.error(`Push failed: ${err.message}`, { duration: 3000 })
        },
      },
    )
  }, [pushSync])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Header */}
      <Card className="border-teal-500/30">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-teal-600" />
            <CardTitle className="text-base">Bidirectional GitHub Sync</CardTitle>
            <Badge variant="outline" className="text-[9px] px-1.5 border-teal-500/40 text-teal-700 dark:text-teal-300">
              Live
            </Badge>
          </div>
          <CardDescription className="text-xs">
            True bidirectional sync: changes in GitHub (issue state, labels, comments) flow back to the dashboard,
            and dashboard changes (status, notes) push to GitHub. No more one-way data flow.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* What it ACTUALLY does info card */}
      <div className="p-3 rounded-md border border-teal-500/20 bg-teal-500/5 space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
          <Github className="h-3.5 w-3.5" />
          What this sync ACTUALLY does right now
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed">
          <strong>Pull (GitHub → Dashboard):</strong> Fetches all open issues from your configured GitHub repo, matches them to audit findings by task number, and updates local finding status based on GitHub issue state. Closed issues mark findings as "fixed" or "won't fix" depending on the close reason.
        </p>
        <p className="text-xs text-foreground/80 leading-relaxed">
          <strong>Push (Dashboard → GitHub):</strong> Creates new GitHub issues from findings that don't have one yet, and updates existing issue labels/titles based on dashboard status changes. Comments on issues reflect dashboard notes.
        </p>
        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
          <AlertCircle className="h-3.5 w-3.5" />
          Requirements
        </div>
        <p className="text-xs text-foreground/80 leading-relaxed font-mono bg-muted/30 p-1.5 rounded">
          Configure a GitHub Personal Access Token in the GitHub Configuration section below. The token needs repo scope for private repos, public_repo scope for public repos. Then set the repository owner/name and project board number.
        </p>
      </div>

      {/* Sync Direction Controls */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Pull: GitHub → Dashboard */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="h-4 w-4 text-teal-600" />
              <h4 className="text-sm font-semibold">Pull: GitHub → Dashboard</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Fetch changes from GitHub issues and update local findings. Handles issue state changes (closed = fixed/wont-fix), label updates, and comment sync.
            </p>
            <Button
              variant="default"
              size="sm"
              className="h-7 text-[11px] bg-teal-600 hover:bg-teal-700 text-white w-full"
              onClick={handlePullSync}
              disabled={pullSync.isPending}
            >
              {pullSync.isPending ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <ArrowDownToLine className="h-3 w-3 mr-1" />}
              Pull from GitHub
            </Button>
          </CardContent>
        </Card>

        {/* Push: Dashboard → GitHub */}
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ArrowUpFromLine className="h-4 w-4 text-purple-600" />
              <h4 className="text-sm font-semibold">Push: Dashboard → GitHub</h4>
            </div>
            <p className="text-xs text-muted-foreground">
              Push dashboard changes to GitHub. Create issues from findings, update issue status based on local progress, and add comments.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px] border-purple-500/30 text-purple-700 hover:bg-purple-500/10"
                onClick={handlePushCreate}
                disabled={pushSync.isPending}
              >
                {pushSync.isPending ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <GitBranch className="h-3 w-3 mr-1" />}
                Create Issues
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={handlePushStatus}
                disabled={pushSync.isPending}
              >
                {pushSync.isPending ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Update Status
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Results */}
      <AnimatePresence mode="wait">
        {pullResult && (
          <motion.div
            key="pull-result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-teal-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <CardTitle className="text-sm">Pull Sync Results</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px]"
                    onClick={() => setShowDetails(v => !v)}
                  >
                    {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Details
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-md border bg-emerald-500/5 p-2">
                    <div className="text-lg font-bold text-emerald-600">{pullResult.summary.syncedFindings}</div>
                    <div className="text-[10px] text-muted-foreground">Synced</div>
                  </div>
                  <div className="rounded-md border bg-orange-500/5 p-2">
                    <div className="text-lg font-bold text-orange-600">{pullResult.summary.unmatchedIssues}</div>
                    <div className="text-[10px] text-muted-foreground">Unmatched</div>
                  </div>
                  <div className="rounded-md border bg-red-500/5 p-2">
                    <div className="text-lg font-bold text-red-600">{pullResult.summary.errors}</div>
                    <div className="text-[10px] text-muted-foreground">Errors</div>
                  </div>
                </div>

                {/* Detailed Results */}
                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar"
                  >
                    {pullResult.syncResults.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded-md bg-muted/30">
                        <Badge
                          variant="outline"
                          className={`text-[9px] px-1 ${
                            r.changeType === 'synced' ? 'border-emerald-500/40 text-emerald-700' :
                            r.changeType === 'error' ? 'border-red-500/40 text-red-700' :
                            r.changeType === 'no-issue' ? 'border-orange-500/40 text-orange-700' :
                            'border-muted text-muted-foreground'
                          }`}
                        >
                          {r.changeType}
                        </Badge>
                        <span className="font-medium">Task {r.task}</span>
                        <span className="text-muted-foreground truncate flex-1">{r.details}</span>
                        {r.localUpdated && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                      </div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}

        {pushResult && (
          <motion.div
            key="push-result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Card className="border-purple-500/20">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <CardTitle className="text-sm">Push Sync Results</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-md border bg-emerald-500/5 p-2">
                    <div className="text-lg font-bold text-emerald-600">{pushResult.summary.success}</div>
                    <div className="text-[10px] text-muted-foreground">Success</div>
                  </div>
                  <div className="rounded-md border bg-red-500/5 p-2">
                    <div className="text-lg font-bold text-red-600">{pushResult.summary.failed}</div>
                    <div className="text-[10px] text-muted-foreground">Failed</div>
                  </div>
                </div>

                {showDetails && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar"
                  >
                    {pushResult.results.map((r, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs p-1.5 rounded-md bg-muted/30">
                        {r.success ? <CheckCircle2 className="h-3 w-3 text-emerald-500" /> : <AlertCircle className="h-3 w-3 text-red-500" />}
                        <span className="font-medium">Task {r.task}</span>
                        <span className="text-muted-foreground truncate flex-1">{r.message}</span>
                      </div>
                    ))}
                  </motion.div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bidirectional Flow Diagram */}
      <Card className="border-teal-500/10">
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-2 justify-center">
            <div className="flex items-center gap-1">
              <Github className="h-3.5 w-3.5 text-teal-500" />
              <span className="font-medium text-foreground">GitHub Issues</span>
            </div>
            <ArrowRightLeft className="h-3 w-3 text-teal-500" />
            <div className="flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5 text-purple-500" />
              <span className="font-medium text-foreground">Dashboard Findings</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            State changes, labels, comments flow bidirectionally. Closing a GitHub issue marks the finding as fixed; 
            marking a finding as fixed closes the GitHub issue.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
