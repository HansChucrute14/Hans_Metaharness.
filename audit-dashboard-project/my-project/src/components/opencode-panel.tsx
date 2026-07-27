'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Alert, AlertDescription, AlertTitle,
} from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Terminal, CheckCircle2, AlertCircle, LoaderCircle, RefreshCw,
  Trash2, Save, Server, Code2, Zap, ExternalLink, Unplug,
  ArrowRight, FileCode2, Bug, Wrench, FlaskConical, GitBranch,
  Monitor, Cpu, Settings2, BrainCircuit, ArrowLeftRight, Radio,
} from 'lucide-react'
import {
  useOpencodeStatus, useSaveOpencodeSettings, useSendToOpencode,
  useDeleteOpencodeSettings, addActivityEntry,
  type OpencodeSettings,
} from '@/lib/use-findings'
import { useProject } from '@/lib/project-context'
import { toast } from 'sonner'

/* ─── Opencode Mode (CLI vs Desktop) ─── */
const OPENCODE_MODES = [
  {
    value: 'cli',
    label: 'Opencode CLI (`opencode serve`)',
    description: 'HTTP API via `opencode serve` — programmatic integration',
    whatItDoes: 'The dashboard connects to an Opencode HTTP server started with `opencode serve`. It uses the OpenAPI 3.1 HTTP API (or the `@opencode-ai/sdk` npm package) to create sessions, send analysis prompts, and receive structured AI responses programmatically — no manual terminal commands needed. If the server is unreachable, actions are queued in the database with manual command suggestions as fallback.',
    howItWorks: '1. You start `opencode serve --port 4096` (or let it run on the default port). 2. The dashboard calls the Opencode HTTP API: creates a session via POST /session, sends a prompt via POST /session/:id/prompt_async, and retrieves results. 3. If the server is unreachable, the dashboard queues the action in the DB and provides a `opencode run "<prompt>"` command you can run manually. 4. Alternatively, you can use the `@opencode-ai/sdk` npm package for typed access to the same API.',
    requirements: 'Install Opencode (https://opencode.ai), configure your preferred LLM provider (Anthropic, OpenAI, Ollama, or 75+ others), and start the HTTP server: `opencode serve --port 4096`. The server must be running when you use AI features. Optionally install `@opencode-ai/sdk` for typed API access.',
    icon: Terminal,
    iconClass: 'text-orange-500',
  },
  {
    value: 'desktop',
    label: 'Opencode Desktop App',
    description: 'Desktop App spawns same HTTP API server as CLI',
    whatItDoes: 'The Opencode Desktop App automatically spawns the same HTTP server as `opencode serve`, exposing the identical OpenAPI 3.1 API on port 4096. The dashboard connects to it via the same HTTP API (or `@opencode-ai/sdk`) to create sessions, send prompts, and receive AI responses — fully programmatically. The Desktop App also provides a visual interface for reviewing diffs and applying changes with point-and-click.',
    howItWorks: '1. Open the Opencode Desktop App — it automatically starts the HTTP server on port 4096. 2. The dashboard connects to the same API endpoint (http://localhost:4096) and uses the same session/message/prompt endpoints as CLI mode. 3. The Desktop App provides a GUI overlay for reviewing results, seeing diffs, and accepting/rejecting changes. 4. You can also use `@opencode-ai/sdk` for typed API access from Node.js scripts.',
    requirements: 'Download the Opencode Desktop App from https://opencode.ai. Open it, configure your LLM provider and workspace. The Desktop App starts the HTTP server automatically — no manual `opencode serve` needed. The app must be running when you use AI features from the dashboard.',
    icon: Monitor,
    iconClass: 'text-blue-500',
  },
]

/* ─── Opencode Actions ─── */
const OPENCODE_ACTIONS = [
  { value: 'analyze', label: 'Analyze', description: 'AI-powered codebase analysis for a finding', icon: Bug },
  { value: 'fix', label: 'Fix', description: 'Implement an AI-driven fix for a finding', icon: Wrench },
  { value: 'review', label: 'Review', description: 'Review current codebase for issues', icon: FileCode2 },
  { value: 'test', label: 'Write Tests', description: 'Generate tests for a finding\'s fix', icon: FlaskConical },
  { value: 'refactor', label: 'Refactor', description: 'Refactor code related to a finding', icon: Code2 },
]

/* ─── Opencode Models ─── */
const OPENCODE_MODELS = [
  { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4', description: 'Most capable Claude model' },
  { value: 'claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', description: 'Fast and capable' },
  { value: 'gpt-4o', label: 'GPT-4o', description: 'OpenAI flagship model' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo', description: 'OpenAI fast model' },
  { value: 'local-ollama', label: 'Local (Ollama)', description: 'Use configured Ollama/local model' },
  { value: 'local-llamacpp', label: 'Local (llama.cpp)', description: 'Use configured llama.cpp server' },
  { value: 'local-ik_llamacpp', label: 'Local (Ik_Llama.cpp)', description: 'Use configured Ik_Llama.cpp server' },
]

/* ─── Main Panel ─── */
export function OpencodePanel() {
  const { activeProject } = useProject()
  const [settings, setSettings] = useState<Partial<OpencodeSettings>>({
    binaryPath: 'opencode',
    workspacePath: '',
    model: 'claude-sonnet-4-20250514',
    endpointUrl: 'http://localhost:4096',
    autoReview: false,
    syncToGithub: true,
    isActive: false,
  })
  const [opencodeMode, setOpencodeMode] = useState<string>('cli')
  const [selectedAction, setSelectedAction] = useState<string>('analyze')
  const [selectedTask, setSelectedTask] = useState<string>('')
  const [actionResult, setActionResult] = useState<string | null>(null)

  const checkStatus = useOpencodeStatus()
  const saveSettings = useSaveOpencodeSettings()
  const sendAction = useSendToOpencode()
  const deleteSettings = useDeleteOpencodeSettings()

  // Derive opencodeStatus and statusChecked from useQuery data directly
  // (no local state copy needed — query data is the source of truth)
  const opencodeStatus = checkStatus.data ?? null
  const statusChecked = !!checkStatus.data

  // Helper to sync form settings from server data
  const syncSettingsFromData = useCallback((
    data: typeof checkStatus.data,
  ) => {
    if (data?.settings) {
      setSettings({
        ...data.settings,
        endpointUrl: data.settings.endpointUrl || 'http://localhost:4096',
      })
    }
  }, [])

  const handleCheckStatus = useCallback(async () => {
    try {
      const result = await checkStatus.refetch()
      if (result.data) {
        syncSettingsFromData(result.data)
        toast.success(result.data.available ? 'Opencode is connected' : 'Opencode not available', { duration: 3000 })
      } else if (result.error) {
        toast.error(`Failed: ${result.error.message}`, { duration: 3000 })
      }
    } catch {
      toast.error('Failed to check Opencode status', { duration: 3000 })
    }
  }, [checkStatus, syncSettingsFromData])

  const handleSave = useCallback(() => {
    saveSettings.mutate(settings, {
      onSuccess: () => {
        toast.success('Opencode settings saved', { duration: 2000 })
        addActivityEntry({ type: 'opencode_action', description: 'Opencode settings updated' })
        handleCheckStatus()
      },
      onError: (err) => {
        toast.error(`Failed: ${err.message}`, { duration: 3000 })
      },
    })
  }, [saveSettings, settings, handleCheckStatus])

  const handleSendAction = useCallback(() => {
    if (!selectedTask && selectedAction !== 'review') {
      toast.error('Please select a task for this action', { duration: 2000 })
      return
    }

    sendAction.mutate(
      { action: selectedAction, task: selectedTask || undefined },
      {
        onSuccess: (data) => {
          setActionResult(data.message)
          toast.success(`Action "${selectedAction}" queued`, { duration: 3000 })
          addActivityEntry({
            type: 'opencode_action',
            task: selectedTask || undefined,
            description: `Opencode action: ${selectedAction} for task ${selectedTask || 'general'}`,
          })
        },
        onError: (err) => {
          toast.error(`Failed: ${err.message}`, { duration: 3000 })
        },
      },
    )
  }, [sendAction, selectedAction, selectedTask])

  const handleDelete = useCallback(() => {
    deleteSettings.mutate(undefined, {
      onSuccess: () => {
        setSettings({ binaryPath: 'opencode', workspacePath: '', model: 'claude-sonnet-4-20250514', endpointUrl: 'http://localhost:4096', autoReview: false, syncToGithub: true, isActive: false })
        toast.success('Opencode settings removed', { duration: 2000 })
      },
      onError: (err) => {
        toast.error(`Failed: ${err.message}`, { duration: 3000 })
      },
    })
  }, [deleteSettings])

  const currentModeInfo = OPENCODE_MODES.find(m => m.value === opencodeMode) ?? OPENCODE_MODES[0]

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      {/* Header */}
      <Card className="border-orange-500/30">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-5 w-5 text-orange-600" />
              <CardTitle className="text-base">Opencode Harness</CardTitle>
              <Badge variant="outline" className="text-[9px] px-1.5">
                {opencodeStatus?.available ? 'Connected' : 'Not Connected'}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[11px]"
                      onClick={handleCheckStatus}
                      disabled={checkStatus.isFetching}
                    >
                      {checkStatus.isFetching ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      Check Status
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Verify Opencode is available</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <CardDescription className="text-xs">
            Integrate with Opencode — a terminal-based or desktop AI coding tool for code analysis, fixes, reviews, and refactoring. 
            Changes made by Opencode can be auto-synced to GitHub.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Status Indicator */}
      {statusChecked && (
        <AnimatePresence mode="wait">
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <Alert className={opencodeStatus?.available ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-orange-500/30 bg-orange-500/5'}>
              {opencodeStatus?.available ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-orange-600" />
              )}
              <AlertTitle className="text-sm font-medium">
                {opencodeStatus?.available ? 'Opencode Available' : 'Opencode Not Available'}
              </AlertTitle>
              <AlertDescription className="text-xs">
                {opencodeStatus?.message}
              </AlertDescription>
            </Alert>
          </motion.div>
        </AnimatePresence>
      )}

      {/* ─── Mode Selection: CLI vs Desktop ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Radio className="h-4 w-4 text-orange-500" />
            Opencode Mode
          </CardTitle>
          <CardDescription className="text-xs">
            Choose how you run Opencode — terminal CLI or Desktop App
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            {OPENCODE_MODES.map(mode => {
              const ModeIcon = mode.icon
              return (
                <button
                  key={mode.value}
                  onClick={() => setOpencodeMode(mode.value)}
                  className={`flex items-center gap-2 p-3 rounded-md border text-left transition-all ${
                    opencodeMode === mode.value
                      ? 'border-orange-500 bg-orange-500/10 shadow-sm'
                      : 'border-border bg-muted/30 hover:bg-muted/60'
                  }`}
                >
                  <ModeIcon className={`h-4 w-4 ${mode.iconClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold">{mode.label}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{mode.description}</div>
                  </div>
                </button>
              )
            })}
          </div>

          {/* What it does / How it works info card */}
          <div className="p-3 rounded-md border border-orange-500/20 bg-orange-500/5 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-orange-700 dark:text-orange-300">
              <BrainCircuit className="h-3.5 w-3.5" />
              What Opencode ACTUALLY does right now
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {currentModeInfo.whatItDoes}
            </p>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300">
              <Settings2 className="h-3.5 w-3.5" />
              How it works
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed">
              {currentModeInfo.howItWorks}
            </p>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              <Zap className="h-3.5 w-3.5" />
              Requirements to get started
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed font-mono bg-muted/30 p-1.5 rounded">
              {currentModeInfo.requirements}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Settings Configuration */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Binary Path (for CLI mode) */}
          {opencodeMode === 'cli' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Binary Path</label>
              <Input
                value={settings.binaryPath ?? ''}
                onChange={(e) => setSettings(prev => ({ ...prev, binaryPath: e.target.value }))}
                placeholder="opencode"
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Path to the Opencode CLI binary (e.g. "opencode" if globally installed, or full path like "/usr/local/bin/opencode")
              </p>
            </div>
          )}

          {/* Desktop App Path (for Desktop mode) */}
          {opencodeMode === 'desktop' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Desktop App Path</label>
              <Input
                value={settings.binaryPath ?? ''}
                onChange={(e) => setSettings(prev => ({ ...prev, binaryPath: e.target.value }))}
                placeholder="/Applications/Opencode.app or opencode-desktop"
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                Path to the Opencode Desktop App binary or app location. On macOS: /Applications/Opencode.app. On Linux/Windows: the executable path.
              </p>
            </div>
          )}

          {/* Workspace Path */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Workspace Path</label>
            <Input
              value={settings.workspacePath ?? ''}
              onChange={(e) => setSettings(prev => ({ ...prev, workspacePath: e.target.value }))}
              placeholder={`/path/to/${activeProject?.repoName ?? 'project'}`}
              className="h-8 text-sm"
            />
            <p className="text-[10px] text-muted-foreground">
              The directory where Opencode operates (should be the project root)
            </p>
          </div>

          {/* Endpoint URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Server Endpoint URL</label>
            <div className="flex items-center gap-2">
              <Input
                value={settings.endpointUrl ?? 'http://localhost:4096'}
                onChange={(e) => setSettings(prev => ({ ...prev, endpointUrl: e.target.value }))}
                placeholder="http://localhost:4096"
                className="h-8 text-sm"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-[11px] shrink-0"
                onClick={handleCheckStatus}
                disabled={checkStatus.isFetching}
              >
                {checkStatus.isFetching ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                Test Connection
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              The Opencode HTTP API endpoint (default: http://localhost:4096). Use `opencode serve --port 4096` or the Desktop App to start the server. Click "Test Connection" to verify it is reachable.
            </p>
            {statusChecked && opencodeStatus?.serverReachable && (
              <Alert className="bg-emerald-500/5 border-emerald-500/20 mt-1.5">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-300">
                  Opencode server is reachable at {settings.endpointUrl || 'http://localhost:4096'}
                </AlertDescription>
              </Alert>
            )}
            {statusChecked && opencodeStatus?.configured && !opencodeStatus?.serverReachable && (
              <Alert className="bg-orange-500/5 border-orange-500/20 mt-1.5">
                <AlertCircle className="h-3 w-3 text-orange-500" />
                <AlertDescription className="text-xs text-orange-700 dark:text-orange-300">
                  Opencode server not reachable at {settings.endpointUrl || 'http://localhost:4096'}. Start it with: `opencode serve --port 4096`
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Model Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">AI Model</label>
            <Select
              value={settings.model ?? 'claude-sonnet-4-20250514'}
              onValueChange={(val) => setSettings(prev => ({ ...prev, model: val }))}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENCODE_MODELS.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    <div className="flex items-center gap-1">
                      {m.value.startsWith('local') && <Cpu className="h-3 w-3 text-teal-500" />}
                      <span className="font-medium">{m.label}</span>
                      <span className="text-[10px] text-muted-foreground">— {m.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {settings.model?.startsWith('local') && (
              <Alert className="bg-teal-500/5 border-teal-500/20 mt-1.5">
                <Cpu className="h-3 w-3 text-teal-500" />
                <AlertDescription className="text-xs text-teal-700 dark:text-teal-300">
                  Local model selected — make sure your AI Connector (Ollama/llama.cpp/Ik_Llama.cpp) is configured and running in the AI Connector section above.
                </AlertDescription>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Toggle Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-xs font-medium">Auto-Review on Changes</label>
                <p className="text-[10px] text-muted-foreground">
                  Automatically run Opencode review when codebase changes are detected
                </p>
              </div>
              <Switch
                checked={settings.autoReview ?? false}
                onCheckedChange={(val) => setSettings(prev => ({ ...prev, autoReview: val }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-xs font-medium">Bidirectional GitHub Sync</label>
                <p className="text-[10px] text-muted-foreground">
                  Opencode changes → auto-commit to GitHub. GitHub changes → auto-sync to dashboard.
                </p>
              </div>
              <Switch
                checked={settings.syncToGithub ?? true}
                onCheckedChange={(val) => setSettings(prev => ({ ...prev, syncToGithub: val }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <label className="text-xs font-medium">Active</label>
                <p className="text-[10px] text-muted-foreground">
                  Enable Opencode integration for this dashboard
                </p>
              </div>
              <Switch
                checked={settings.isActive ?? false}
                onCheckedChange={(val) => setSettings(prev => ({ ...prev, isActive: val }))}
              />
            </div>
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="default"
              size="sm"
              className="h-7 text-[11px] bg-orange-600 hover:bg-orange-700 text-white"
              onClick={handleSave}
              disabled={saveSettings.isPending}
            >
              {saveSettings.isPending ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
              Save Settings
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] border-red-500/30 text-red-700 hover:bg-red-500/10"
              onClick={handleDelete}
              disabled={deleteSettings.isPending}
            >
              {deleteSettings.isPending ? <LoaderCircle className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />}
              Remove
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4 text-orange-500" />
            Quick Actions
          </CardTitle>
          <CardDescription className="text-xs">
            Send findings to Opencode for AI-driven analysis, fixes, and reviews
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Action Selection */}
          <div className="flex items-center gap-2">
            <Select value={selectedAction} onValueChange={setSelectedAction}>
              <SelectTrigger className="h-8 text-sm flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPENCODE_ACTIONS.map(a => {
                  const Icon = a.icon
                  return (
                    <SelectItem key={a.value} value={a.value}>
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3 w-3" />
                        <span>{a.label}</span>
                        <span className="text-[10px] text-muted-foreground">— {a.description}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Task Selection (optional for "review" action) */}
          {selectedAction !== 'review' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Task (Finding)</label>
              <Input
                value={selectedTask}
                onChange={(e) => setSelectedTask(e.target.value)}
                placeholder="e.g. 1, 2, X1"
                className="h-8 text-sm"
              />
              <p className="text-[10px] text-muted-foreground">
                The task number from the audit finding to send to Opencode
              </p>
            </div>
          )}

          {/* Execute Button */}
          <Button
            variant="default"
            size="sm"
            className="h-7 text-[11px] bg-orange-600 hover:bg-orange-700 text-white"
            onClick={handleSendAction}
            disabled={sendAction.isPending || (!selectedTask && selectedAction !== 'review')}
          >
            {sendAction.isPending ? (
              <LoaderCircle className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <ArrowRight className="h-3 w-3 mr-1" />
            )}
            Send to Opencode
          </Button>

          {/* Result */}
          {actionResult && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Alert className="border-orange-500/20 bg-orange-500/5">
                <Terminal className="h-4 w-4 text-orange-600" />
                <AlertTitle className="text-xs font-medium">Action Queued</AlertTitle>
                <AlertDescription className="text-[11px] leading-relaxed">
                  {actionResult}
                </AlertDescription>
              </Alert>
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Bidirectional Flow Diagram */}
      <Card className="border-orange-500/20">
        <CardContent className="p-4">
          <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" />
            How the bidirectional sync ACTUALLY works right now
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-3 justify-center mb-2">
            <div className="flex items-center gap-1">
              <Terminal className="h-3.5 w-3.5 text-orange-500" />
              <span className="font-medium text-foreground">Opencode</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <Code2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="font-medium text-foreground">Codebase</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5 text-teal-500" />
              <span className="font-medium text-foreground">GitHub</span>
            </div>
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            <div className="flex items-center gap-1">
              <Bug className="h-3.5 w-3.5 text-red-500" />
              <span className="font-medium text-foreground">Dashboard</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-foreground/80">
              <ArrowRight className="h-3 w-3 text-orange-500" />
              <span><strong>Outbound:</strong> Opencode edits code → changes auto-commit to GitHub (when sync enabled) → GitHub webhook/refresh → dashboard updates finding status</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-foreground/80">
              <ArrowLeftRight className="h-3 w-3 text-teal-500" />
              <span><strong>Inbound:</strong> GitHub issues/PRs created from dashboard → Opencode reads them → fixes code → loop continues</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Currently, outbound sync creates queued actions that you execute via Opencode CLI or Desktop App. Full bidirectional auto-sync requires GitHub webhooks configured separately.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  )
}
