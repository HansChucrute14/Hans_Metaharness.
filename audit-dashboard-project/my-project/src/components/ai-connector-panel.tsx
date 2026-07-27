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
import { Slider } from '@/components/ui/slider'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  BrainCircuit, Wifi, WifiOff, AlertCircle, CheckCircle2,
  LoaderCircle, RefreshCw, Trash2, Save, Server, Cpu,
  ChevronDown, ChevronUp, Settings2, Zap, Unplug,
} from 'lucide-react'
import {
  useTestAIConnector, useSaveAIConnector, useListAIModels,
  useDeleteAIConnector, useAIConnectorStatus,
  type AIConnectorData,
} from '@/lib/use-findings'

/* ─── Connector type definitions ─── */
const CONNECTOR_TYPES = [
  { value: 'ollama', label: 'Ollama', description: 'Local Ollama server (default port: 11434)', defaultUrl: 'http://localhost:11434',
    whatItDoes: 'Connects to an Ollama server running locally. Ollama manages model downloads, runs inference, and exposes an OpenAI-compatible API. When connected, the dashboard can send audit findings to your local model for AI-powered analysis, summaries, and suggested fixes.',
    howItWorks: 'The dashboard sends HTTP requests to your Ollama endpoint (default: localhost:11434). Ollama processes the prompt through your chosen model and returns the AI response. No data leaves your machine — everything stays local.',
    requirements: 'Install Ollama (https://ollama.com), run `ollama serve`, and pull a model (e.g. `ollama pull llama3`). The server must be running when you use AI features.',
  },
  { value: 'llamacpp', label: 'llama.cpp', description: 'llama.cpp server (default port: 8080)', defaultUrl: 'http://localhost:8080',
    whatItDoes: 'Connects to a llama.cpp server running locally. llama.cpp provides lightweight, high-performance LLM inference with GPU/CPU offloading. When connected, the dashboard sends findings to your model for local AI analysis — no cloud dependency.',
    howItWorks: 'llama.cpp exposes an OpenAI-compatible completion API at its endpoint. The dashboard formats findings as prompts, sends them via HTTP POST, and receives AI-generated analysis. Supports quantized models (GGUF) for efficient local inference.',
    requirements: 'Build llama.cpp with server support (`make`), prepare a GGUF model file, and launch: `./llama-server -m model.gguf --port 8080`. GPU acceleration available via CUDA/Metal/Vulkan.',
  },
  { value: 'ik_llamacpp', label: 'Ik_Llama.cpp', description: 'Ik_Llama.cpp — optimized llama.cpp fork with better KV cache & batching (default port: 8081)', defaultUrl: 'http://localhost:8081',
    whatItDoes: 'Connects to an Ik_Llama.cpp server — an optimized fork of llama.cpp focused on improving throughput and reducing memory overhead. It uses the same GGUF model format as llama.cpp, so you can reuse your existing quantized models. When connected, the dashboard uses this faster local inference engine for AI analysis of audit findings — ideal when you need to analyze many findings back-to-back.',
    howItWorks: 'Ik_Llama.cpp runs an OpenAI-compatible API server just like llama.cpp, but with improved KV cache management (smarter cache eviction, longer effective context for repeated prompts) and better multi-request batching (multiple in-flight requests share intermediate state more efficiently). This means lower latency per token and lower memory overhead when the dashboard sends several findings in sequence. The dashboard sends the same prompt format — findings as structured analysis requests — and Ik_Llama.cpp returns AI responses faster than vanilla llama.cpp, especially under concurrent load.',
    requirements: 'Clone Ik_Llama.cpp from its GitHub repo, build with server support (same `make` target as llama.cpp), and reuse any existing GGUF model file (same format as llama.cpp). Launch the server on port 8081 — `./ik_llama-server -m model.gguf --port 8081` — to avoid conflicts with a vanilla llama.cpp server on 8080. GPU acceleration is available via CUDA/Metal/Vulkan, same as llama.cpp.',
  },
  { value: 'openai-compatible', label: 'OpenAI-Compatible', description: 'LM Studio, text-generation-webui, koboldcpp, etc. — any /v1/chat/completions server (default port: 1234)', defaultUrl: 'http://localhost:1234',
    whatItDoes: 'Connects to any local server that implements the OpenAI chat/completions API. Works with LM Studio, text-generation-webui (oobabooga), koboldcpp, vLLM, and similar tools. The dashboard sends findings as prompts and receives AI-generated analysis — root cause analysis, impact assessment, fix strategy, and testing recommendations. Multiple tools are supported because they all speak the same OpenAI API dialect.',
    howItWorks: 'These tools expose a /v1/chat/completions endpoint compatible with the OpenAI API format. The dashboard sends structured prompts about audit findings (claim, evidence, affected files, proposals) as a chat message, and receives an analysis response in OpenAI format (choices[0].message.content). Fully local — no data is sent to external servers. Model selection, system prompt, temperature, and token limits are all configurable through the tool\'s own UI.',
    requirements: 'Install your preferred tool (LM Studio, text-generation-webui, koboldcpp, vLLM, etc.), load a model into it, and start its local OpenAI-compatible server. Confirm the port matches what you configure here (LM Studio defaults to 1234, koboldcpp to 5001, text-generation-webui to 5000) and that the server is running before using AI features from the dashboard.',
  },
  { value: 'opencode-desktop', label: 'Opencode Server', description: 'Connect to an Opencode server (CLI or Desktop App) via its HTTP API (default port: 4096)', defaultUrl: 'http://localhost:4096',
    whatItDoes: 'Connects to an Opencode server running locally. Opencode is an AI coding agent that exposes an OpenAPI 3.1 HTTP API. When connected, the dashboard can create Opencode sessions, send analysis prompts, and receive structured AI responses — all programmatically, without needing to use the terminal manually.',
    howItWorks: 'The Opencode server (started with `opencode serve` or automatically by the Desktop App) exposes an HTTP API at its endpoint. The dashboard creates a session via the API, sends a structured analysis prompt containing the finding details, and receives the AI response. The server uses whatever LLM model Opencode is configured with (supports Anthropic, OpenAI, Ollama, and 75+ other providers).',
    requirements: 'Install Opencode (https://opencode.ai), configure your preferred LLM provider, and start the server: `opencode serve --port 4096`. Or use the Desktop App which starts the server automatically. The server must be running when you use AI features.',
  },
  { value: 'custom', label: 'Custom', description: 'Any other local LLM endpoint', defaultUrl: 'http://localhost:8080',
    whatItDoes: 'Connects to any custom LLM inference endpoint that accepts HTTP requests. This is a fallback option for servers that don\'t match the standard Ollama or OpenAI-compatible formats. You configure the URL and the dashboard attempts to communicate with it.',
    howItWorks: 'The dashboard sends HTTP requests to your custom endpoint. The response format depends on your server. Basic connectivity testing is available, but full functionality requires the endpoint to return text responses to prompt inputs.',
    requirements: 'Have a local HTTP server running that can accept prompt text and return model responses. Configure the URL and port manually.',
  },
]

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  connected: {
    icon: <Wifi className="h-4 w-4" />,
    color: 'text-emerald-700 dark:text-emerald-300',
    bg: 'bg-emerald-500/10 border-emerald-500/30',
    label: 'Connected',
  },
  disconnected: {
    icon: <WifiOff className="h-4 w-4" />,
    color: 'text-muted-foreground',
    bg: 'bg-muted/40 border-border',
    label: 'Disconnected',
  },
  error: {
    icon: <AlertCircle className="h-4 w-4" />,
    color: 'text-red-700 dark:text-red-300',
    bg: 'bg-red-500/10 border-red-500/30',
    label: 'Error',
  },
}

/* ─── AI Connector Panel ─── */
export function AIConnectorPanel() {
  // Mutations
  const testMutation = useTestAIConnector()
  const saveMutation = useSaveAIConnector()
  const listModelsMutation = useListAIModels()
  const deleteMutation = useDeleteAIConnector()
  const statusQuery = useAIConnectorStatus()

  // Derive connectors from query data directly (no local state copy)
  const connectors = statusQuery.data?.connectors ?? []

  // Local state
  const [selectedConnectorName, setSelectedConnectorName] = useState<string>('ollama')
  const [isExpanded, setIsExpanded] = useState(true)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; models?: string[] } | null>(null)
  const [availableModels, setAvailableModels] = useState<string[]>([])

  // Form state for the currently selected connector
  const [connectorType, setConnectorType] = useState<string>('ollama')
  const [endpointUrl, setEndpointUrl] = useState<string>('http://localhost:11434')
  const [modelName, setModelName] = useState<string>('')
  const [temperature, setTemperature] = useState<number>(0.7)
  const [maxTokens, setMaxTokens] = useState<number>(4096)
  const [isActive, setIsActive] = useState<boolean>(false)

  // Auto-select the active connector when data arrives
  const activeConnectorName = connectors.find(c => c.isActive)?.name
  if (activeConnectorName && selectedConnectorName === 'ollama' && !connectors.find(c => c.name === 'ollama')) {
    setSelectedConnectorName(activeConnectorName)
    const activeConnector = connectors.find(c => c.isActive)!
    setConnectorType(activeConnector.type)
    setEndpointUrl(activeConnector.endpointUrl)
    setModelName(activeConnector.modelName ?? '')
    setTemperature(activeConnector.temperature)
    setMaxTokens(activeConnector.maxTokens)
    setIsActive(activeConnector.isActive)
  }

  // When user selects a different connector from the dropdown, populate form fields
  const handleSelectConnector = useCallback((name: string) => {
    setSelectedConnectorName(name)
    const existing = connectors.find(c => c.name === name)
    if (existing) {
      setConnectorType(existing.type)
      setEndpointUrl(existing.endpointUrl)
      setModelName(existing.modelName ?? '')
      setTemperature(existing.temperature)
      setMaxTokens(existing.maxTokens)
      setIsActive(existing.isActive)
    } else {
      // New connector — set defaults based on type
      const typeConfig = CONNECTOR_TYPES.find(t => t.value === name) ?? CONNECTOR_TYPES[0]
      setConnectorType(typeConfig.value)
      setEndpointUrl(typeConfig.defaultUrl)
      setModelName('')
      setTemperature(0.7)
      setMaxTokens(4096)
      setIsActive(false)
    }
    setTestResult(null)
    setAvailableModels([])
  }, [connectors])

  // When connector type changes, update default URL
  const handleTypeChange = useCallback((type: string) => {
    setConnectorType(type)
    const typeConfig = CONNECTOR_TYPES.find(t => t.value === type)
    if (typeConfig) {
      setEndpointUrl(typeConfig.defaultUrl)
    }
    setTestResult(null)
    setAvailableModels([])
  }, [])

  // Test connection
  const handleTestConnection = useCallback(() => {
    setTestResult(null)
    testMutation.mutate({ endpointUrl, type: connectorType }, {
      onSuccess: (data) => {
        setTestResult(data)
        if (data.success && data.models) {
          setAvailableModels(data.models)
        }
      },
      onError: (err) => {
        setTestResult({ success: false, message: err.message })
      },
    })
  }, [endpointUrl, connectorType, testMutation])

  // List models (for an already saved connector)
  const handleListModels = useCallback(() => {
    listModelsMutation.mutate(selectedConnectorName, {
      onSuccess: (data) => {
        setAvailableModels(data.models)
      },
    })
  }, [selectedConnectorName, listModelsMutation])

  // Save connector
  const handleSave = useCallback(() => {
    saveMutation.mutate({
      name: selectedConnectorName,
      type: connectorType,
      endpointUrl,
      modelName: modelName || undefined,
      temperature,
      maxTokens,
      isActive,
    }, {
      onSuccess: () => {
        // Refresh connectors list via refetch
        statusQuery.refetch()
      },
    })
  }, [selectedConnectorName, connectorType, endpointUrl, modelName, temperature, maxTokens, isActive, saveMutation, statusQuery])

  // Delete connector
  const handleDelete = useCallback(() => {
    deleteMutation.mutate(selectedConnectorName, {
      onSuccess: () => {
        statusQuery.refetch()
        // Reset to defaults
        setSelectedConnectorName('ollama')
        setConnectorType('ollama')
        setEndpointUrl('http://localhost:11434')
        setModelName('')
        setTemperature(0.7)
        setMaxTokens(4096)
        setIsActive(false)
        setTestResult(null)
        setAvailableModels([])
      },
    })
  }, [selectedConnectorName, deleteMutation, statusQuery])

  // Refresh connector status
  const handleRefresh = useCallback(() => {
    statusQuery.refetch()
  }, [statusQuery])

  // Find the current connector's status from the saved data
  const currentSavedConnector = connectors.find(c => c.name === selectedConnectorName)
  const currentStatus = currentSavedConnector?.status ?? 'disconnected'
  const statusConfig = STATUS_CONFIG[currentStatus] ?? STATUS_CONFIG.disconnected

  // Determine the effective status (combine test result with saved status)
  const effectiveStatus = testResult
    ? (testResult.success ? 'connected' : 'error')
    : currentStatus

  const effectiveStatusConfig = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG.disconnected

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}>
      <Card className="border-2 border-violet-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-violet-500/20 border border-violet-500/40">
                <BrainCircuit className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-base text-violet-800 dark:text-violet-200">AI Connector Settings</CardTitle>
                <CardDescription className="text-xs">Connect to local LLM models (Ollama, LM Studio) for AI analysis</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Status indicator */}
              <Badge className={`text-xs px-2 py-1 ${effectiveStatusConfig.bg} ${effectiveStatusConfig.color} border`}>
                <span className="flex items-center gap-1">
                  {effectiveStatusConfig.icon}
                  {effectiveStatusConfig.label}
                </span>
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </Button>
            </div>
          </div>
        </CardHeader>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="space-y-4">
                {/* ── Active connector toggle ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">AI Provider Mode</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-medium ${!isActive ? 'text-violet-700 dark:text-violet-300' : 'text-muted-foreground'}`}>
                        ☁️ Cloud AI
                      </span>
                      <Switch
                        checked={isActive}
                        onCheckedChange={setIsActive}
                        className="data-[state=checked]:bg-violet-600"
                      />
                      <span className={`text-xs font-medium ${isActive ? 'text-violet-700 dark:text-violet-300' : 'text-muted-foreground'}`}>
                        🖥️ Local AI
                      </span>
                    </div>
                  </div>
                  {!isActive && (
                    <Alert className="bg-muted/40 border-border">
                      <AlertDescription className="text-xs text-muted-foreground">
                        Using cloud AI (z-ai-web-dev-sdk). Toggle to Local AI to use your own running LLM model.
                      </AlertDescription>
                    </Alert>
                  )}
                  {isActive && (
                    <Alert className="bg-violet-500/5 border-violet-500/30">
                      <AlertDescription className="text-xs text-violet-700 dark:text-violet-300">
                        Using local AI connector. Make sure your LLM server is running before analyzing findings.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>

                <Separator />

                {/* ── Connector selection ── */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Server className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Connector</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Select value={selectedConnectorName} onValueChange={handleSelectConnector}>
                      <SelectTrigger className="text-sm w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONNECTOR_TYPES.map(ct => (
                          <SelectItem key={ct.value} value={ct.value}>
                            {ct.label}
                          </SelectItem>
                        ))}
                        {/* Also show any custom connectors from the database */}
                        {connectors
                          .filter(c => !CONNECTOR_TYPES.some(ct => ct.value === c.name))
                          .map(c => (
                            <SelectItem key={c.name} value={c.name}>
                              {c.name} ({c.type})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleRefresh}
                            disabled={statusQuery.isFetching}
                          >
                            {statusQuery.isFetching ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Refresh connector status</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    {currentSavedConnector && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-red-500 hover:text-red-600"
                              onClick={handleDelete}
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete this connector</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>

                  {/* Connector info */}
                  {currentSavedConnector && (
                    <div className={`p-2 rounded-md border text-xs ${statusConfig.bg}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {statusConfig.icon}
                        <span className={`font-semibold ${statusConfig.color}`}>
                          {currentSavedConnector.type} — {statusConfig.label}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {currentSavedConnector.modelName ?? 'No model selected'}
                        </Badge>
                        {currentSavedConnector.lastPingAt && (
                          <span className="text-[10px] text-muted-foreground">
                            Last ping: {new Date(currentSavedConnector.lastPingAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* ── Endpoint configuration ── */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endpoint Configuration</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Connector Type</label>
                      <Select value={connectorType} onValueChange={handleTypeChange}>
                        <SelectTrigger className="text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CONNECTOR_TYPES.map(ct => (
                            <SelectItem key={ct.value} value={ct.value}>
                              {ct.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-muted-foreground">
                        {CONNECTOR_TYPES.find(ct => ct.value === connectorType)?.description}
                      </p>
                    </div>

                    {/* ── "What it does / How it works / Requirements" info card ── */}
                    {(() => {
                      const ctInfo = CONNECTOR_TYPES.find(ct => ct.value === connectorType)
                      if (!ctInfo) return null
                      return (
                        <div className="integration-section col-span-1 sm:col-span-2 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">
                            <BrainCircuit className="h-3.5 w-3.5" />
                            What this connector ACTUALLY does right now
                          </div>
                          <div className="integration-desc-block">
                            <p>{ctInfo.whatItDoes}</p>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 uppercase tracking-wide">
                            <Settings2 className="h-3.5 w-3.5" />
                            How it works
                          </div>
                          <div className="integration-desc-block">
                            <p>{ctInfo.howItWorks}</p>
                          </div>
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
                            <Zap className="h-3.5 w-3.5" />
                            Requirements to get started
                          </div>
                          <div className="integration-desc-block">
                            <p className="font-mono bg-muted/40 p-2 rounded text-[11px] whitespace-pre-wrap">
                              {ctInfo.requirements}
                            </p>
                          </div>
                        </div>
                      )
                    })()}

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Endpoint URL</label>
                      <Input
                        placeholder="http://localhost:11434"
                        value={endpointUrl}
                        onChange={e => setEndpointUrl(e.target.value)}
                        className="text-sm"
                      />
                      <p className="text-[10px] text-muted-foreground">
                        URL of your local LLM server
                      </p>
                    </div>
                  </div>

                  {/* Test connection button */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs border-violet-500/30 text-violet-700 hover:bg-violet-500/10"
                      onClick={handleTestConnection}
                      disabled={testMutation.isPending || !endpointUrl.trim()}
                    >
                      {testMutation.isPending ? (
                        <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /> Testing...</>
                      ) : (
                        <><Wifi className="h-3 w-3 mr-1" /> Test Connection</>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={handleListModels}
                      disabled={listModelsMutation.isPending}
                    >
                      {listModelsMutation.isPending ? (
                        <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /> Loading...</>
                      ) : (
                        <><RefreshCw className="h-3 w-3 mr-1" /> List Models</>
                      )}
                    </Button>
                  </div>

                  {/* Test result */}
                  {testResult && (
                    <div className={`p-2 rounded-md border text-xs ${
                      testResult.success
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        {testResult.success ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                        <span className="font-semibold">{testResult.message}</span>
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* ── Model selection ── */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Model & Parameters</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Model Name</label>
                      {availableModels.length > 0 ? (
                        <Select value={modelName} onValueChange={setModelName}>
                          <SelectTrigger className="text-sm">
                            <SelectValue placeholder="Select a model" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableModels.map(m => (
                              <SelectItem key={m} value={m}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          placeholder="e.g. llama3, codellama"
                          value={modelName}
                          onChange={e => setModelName(e.target.value)}
                          className="text-sm"
                        />
                      )}
                      <p className="text-[10px] text-muted-foreground">
                        {availableModels.length > 0
                          ? `${availableModels.length} models available from endpoint`
                          : 'Test connection first to discover available models, or type manually'
                        }
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground">Max Tokens</label>
                      <Input
                        type="number"
                        value={maxTokens}
                        onChange={e => setMaxTokens(Number(e.target.value))}
                        className="text-sm"
                        min={128}
                        max={32768}
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Maximum response length (128–32768)
                      </p>
                    </div>
                  </div>

                  {/* Temperature slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-muted-foreground">Temperature</label>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                        {temperature.toFixed(2)}
                      </Badge>
                    </div>
                    <Slider
                      value={[temperature]}
                      onValueChange={(v) => setTemperature(v[0])}
                      min={0}
                      max={2}
                      step={0.05}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Precise (0.0)</span>
                      <span>Balanced (0.7)</span>
                      <span>Creative (2.0)</span>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* ── Save / Actions ── */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-violet-600 hover:bg-violet-700 text-white text-xs"
                    onClick={handleSave}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /> Saving...</>
                    ) : (
                      <><Save className="h-3 w-3 mr-1" /> Save Connector</>
                    )}
                  </Button>

                  {saveMutation.isSuccess && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Saved
                    </Badge>
                  )}

                  {saveMutation.isError && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300">
                      <AlertCircle className="h-2.5 w-2.5 mr-0.5" /> {saveMutation.error?.message ?? 'Error'}
                    </Badge>
                  )}
                </div>

                {/* ── Saved connectors list ── */}
                {connectors.length > 0 && (
                  <div className="space-y-2 mt-4">
                    <span className="text-xs font-semibold text-muted-foreground">Saved Connectors</span>
                    <div className="max-h-48 overflow-y-auto space-y-1 custom-scrollbar">
                      {connectors.map(conn => {
                        const sc = STATUS_CONFIG[conn.status] ?? STATUS_CONFIG.disconnected
                        return (
                          <div
                            key={conn.id}
                            className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                              conn.name === selectedConnectorName
                                ? 'bg-violet-500/10 border-violet-500/30'
                                : 'bg-muted/30 border-border hover:bg-muted/60'
                            }`}
                            onClick={() => handleSelectConnector(conn.name)}
                          >
                            {sc.icon}
                            <span className={`font-semibold ${sc.color}`}>{conn.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1 py-0">{conn.type}</Badge>
                            {conn.modelName && (
                              <Badge variant="outline" className="text-[10px] px-1 py-0">{conn.modelName}</Badge>
                            )}
                            {conn.isActive && (
                              <Badge className="text-[10px] px-1 py-0 bg-violet-500/10 border border-violet-500/30 text-violet-700 dark:text-violet-300">
                                Active
                              </Badge>
                            )}
                            <span className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                              {conn.endpointUrl}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}
