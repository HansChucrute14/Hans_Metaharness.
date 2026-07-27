'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  BrainCircuit, X, Send, Trash2, AlertCircle, LoaderCircle,
  WifiOff, Sparkles, RefreshCw, MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAIConnectorStatus, type AIConnectorData } from '@/lib/use-findings'
import type { Finding } from '@/lib/data'

/* ─── TYPES ─── */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  error?: boolean
  pending?: boolean
}

export interface AIChatPanelProps {
  /** Optional: the connector name to use for chat. If not provided, the
   * active connector (or first available) will be used. */
  activeAIConnector?: string
  /** Optional: the model name override. If not provided, the connector's
   * configured model is used. */
  activeAIModel?: string
  /** The currently focused finding — used by the "Analyze Finding" action
   * to pre-fill a prompt with finding details. */
  focusedFinding?: Finding | null
  /** Optional controlled open state. If not provided, the panel manages its
   * own open state internally. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/* ─── HOOK: useAIChat ─── */
/**
 * Manages chat messages, loading state, and sends requests to
 * `/api/ai/connector` with `action: 'chat'`.
 */
export function useAIChat(opts: {
  connectorName?: string
  modelName?: string
}) {
  const { connectorName, modelName } = opts
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryPayload, setRetryPayload] = useState<ChatMessage[] | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll to bottom whenever messages change
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Defer to next paint to ensure DOM is updated
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight
    })
    return () => cancelAnimationFrame(id)
  }, [messages, isLoading])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || isLoading) return

    setError(null)

    // Build the next messages array with the new user message appended.
    // We include prior assistant/user turns so the model has full context.
    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    }
    const pendingAssistant: ChatMessage = {
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      pending: true,
    }
    const nextMessages = [...messages, userMsg]
    setMessages([...nextMessages, pendingAssistant])
    setIsLoading(true)
    setRetryPayload(null)

    // The server expects a plain {role, content} shape — strip local-only
    // fields like `timestamp`, `pending`, `error` before sending.
    const outbound = nextMessages
      .filter(m => !m.error)
      .map(m => ({ role: m.role, content: m.content }))

    try {
      const res = await fetch('/api/ai/connector', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          connectorName,
          model: modelName,
          messages: outbound,
        }),
      })

      const data = await res.json() as { reply?: string; error?: string }

      if (!res.ok) {
        const errMsg = data.error ?? `Request failed with status ${res.status}`
        throw new Error(errMsg)
      }

      const reply = data.reply ?? ''
      if (!reply) throw new Error('AI returned an empty response')

      setMessages(prev => [
        ...prev.slice(0, -1), // remove pending assistant placeholder
        {
          role: 'assistant' as const,
          content: reply,
          timestamp: Date.now(),
        },
      ])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat request failed'
      setError(message)
      // Replace the pending assistant placeholder with an error marker so
      // the user can see something went wrong, and stash the outbound
      // payload for retry.
      setMessages(prev => [
        ...prev.slice(0, -1),
        {
          role: 'assistant',
          content: `⚠️ ${message}`,
          timestamp: Date.now(),
          error: true,
        },
      ])
      setRetryPayload(outbound)
    } finally {
      setIsLoading(false)
    }
  }, [messages, isLoading, connectorName, modelName])

  const retry = useCallback(() => {
    if (!retryPayload) return
    // The retry payload is the array WITHOUT the failed assistant message.
    // We reset messages to it and re-send the last user content.
    const lastUser = [...retryPayload].reverse().find(m => m.role === 'user')
    setMessages(retryPayload.map(m => ({ ...m })))
    setRetryPayload(null)
    if (lastUser) {
      // Defer the send so state update completes first
      setTimeout(() => {
        void sendMessage(lastUser.content)
      }, 0)
    }
  }, [retryPayload, sendMessage])

  const clearChat = useCallback(() => {
    setMessages([])
    setError(null)
    setRetryPayload(null)
    setIsLoading(false)
  }, [])

  const insertPrompt = useCallback((text: string) => {
    // Pre-fill the input — directly mutates `inputText` so the caller
    // doesn't need to wire up a sync effect.
    setInputText(text)
  }, [])

  const [inputText, setInputText] = useState('')

  return {
    messages,
    isLoading,
    error,
    scrollRef,
    sendMessage,
    clearChat,
    retry,
    canRetry: !!retryPayload,
    inputText,
    setInputText,
    insertPrompt,
  }
}

/* ─── COMPONENT ─── */
export function AIChatPanel({
  activeAIConnector,
  activeAIModel,
  focusedFinding,
  open: controlledOpen,
  onOpenChange,
}: AIChatPanelProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const isOpen = controlledOpen ?? uncontrolledOpen
  const setIsOpen = useCallback((next: boolean) => {
    if (onOpenChange) onOpenChange(next)
    else setUncontrolledOpen(next)
  }, [onOpenChange])

  const statusQuery = useAIConnectorStatus()

  // Derive the matched connector from query data directly.
  // When data arrives or changes, find the connector matching the
  // activeAIConnector prop (or the active one, or the first one).
  const connectorStatus = useMemo<AIConnectorData | null>(() => {
    const data = statusQuery.data
    if (!data) return null
    const match =
      (activeAIConnector
        ? data.connectors.find(c => c.name === activeAIConnector)
        : null) ??
      data.connectors.find(c => c.isActive) ??
      data.connectors[0] ??
      null
    return match ?? null
  }, [statusQuery.data, activeAIConnector])

  // Trigger a refetch when the panel opens (useQuery auto-fetches on mount,
  // but we want a fresh fetch every time it re-opens).
  useEffect(() => {
    if (!isOpen) return
    void statusQuery.refetch()
  }, [isOpen])

  // Allow the refresh button to trigger a refetch
  const refreshStatus = useCallback(() => {
    void statusQuery.refetch()
  }, [statusQuery])

  // Alias for clarity in the JSX — true while a status fetch is in-flight.
  const isCheckingStatus = statusQuery.isFetching

  const effectiveConnectorName = activeAIConnector ?? connectorStatus?.name
  const effectiveModelName = activeAIModel ?? connectorStatus?.modelName ?? undefined

  const {
    messages,
    isLoading,
    error,
    scrollRef,
    sendMessage,
    clearChat,
    retry,
    canRetry,
    inputText,
    setInputText,
    insertPrompt,
  } = useAIChat({
    connectorName: effectiveConnectorName,
    modelName: effectiveModelName,
  })

  const handleSend = () => {
    void sendMessage(inputText)
    setInputText('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter to send, Shift+Enter for newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleAnalyzeFinding = useCallback(() => {
    if (!focusedFinding) {
      toast.info('No finding focused — select a finding first (j/k to navigate).', { duration: 2500 })
      return
    }
    const f = focusedFinding
    const prompt = `Analyze this audit finding and suggest a remediation strategy.

**Task ${f.task}: ${f.title}**
- Severity: ${f.severity}
- Tier: ${f.tier}
- Category: ${f.category}
- Affected files: ${f.affectedFiles.join(', ') || 'N/A'}

**Claim:** ${f.claim}

**Evidence:** ${f.evidence}

**Current status:** ${f.verificationStatus}

Please provide:
1. Root cause analysis — what's the deepest underlying cause?
2. Impact assessment — what could go wrong in production?
3. Recommended fix strategy — concrete code-level steps.
4. Testing strategy — how should the fix be verified?
5. Risks and dependencies — what other findings might interact with this?`
    insertPrompt(prompt)
    if (!isOpen) setIsOpen(true)
  }, [focusedFinding, insertPrompt, isOpen, setIsOpen])

  const isConnected = connectorStatus?.status === 'connected'
  const statusDotClass = isConnected
    ? 'connected'
    : connectorStatus?.status === 'error'
      ? 'error'
      : 'disconnected'

  // Summary line for the header
  const summaryLine = useMemo(() => {
    if (!connectorStatus) return 'No connector configured'
    const model = effectiveModelName ?? connectorStatus.modelName ?? 'no model'
    return `${connectorStatus.name} · ${model}`
  }, [connectorStatus, effectiveModelName])

  return (
    <>
      {/* Floating toggle button — bottom right */}
      <motion.div
        className="fixed bottom-4 right-4 z-40 no-print"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.7, type: 'spring' }}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={`h-10 w-10 rounded-full shadow-lg backdrop-blur-md border-2 transition-all ${
                  isOpen
                    ? 'bg-violet-600 text-white border-violet-500 shadow-violet-500/20'
                    : 'bg-background/80 border-border hover:border-violet-500/50 hover:bg-violet-500/10'
                }`}
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Toggle AI chat panel"
              >
                <BrainCircuit className="h-4 w-4" />
                {isConnected && !isOpen && (
                  <span className="absolute -top-1 -right-1 bg-emerald-500 text-white text-[9px] font-bold rounded-full h-4 min-w-4 flex items-center justify-center px-1">
                    ●
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">AI Chat (Shift+A)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </motion.div>

      {/* Expandable chat window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-16 right-4 z-40 no-print w-[min(380px,calc(100vw-2rem))]"
          >
            <div className="rounded-lg border shadow-xl backdrop-blur-md bg-background/95 border-violet-500/20 overflow-hidden flex flex-col max-h-[36rem]">
              {/* Header */}
              <div className="flex items-center justify-between p-3 border-b bg-violet-500/5">
                <div className="flex items-center gap-2 min-w-0">
                  <BrainCircuit className="h-4 w-4 text-violet-600 flex-shrink-0" />
                  <h3 className="text-sm font-semibold text-violet-700 dark:text-violet-300 truncate">
                    AI Chat
                  </h3>
                  <Badge
                    variant="outline"
                    className={`text-[9px] px-1.5 py-0 flex items-center gap-1 flex-shrink-0 ${
                      isConnected
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : connectorStatus?.status === 'error'
                          ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                          : 'bg-muted/40 border-border text-muted-foreground'
                    }`}
                  >
                    <span className={`connector-status-dot ${statusDotClass}`} />
                    {connectorStatus?.status ?? 'no connector'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={refreshStatus}
                        disabled={isCheckingStatus}
                        aria-label="Refresh connector status"
                      >
                        {isCheckingStatus
                          ? <LoaderCircle className="h-3 w-3 animate-spin" />
                          : <RefreshCw className="h-3 w-3" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Refresh connector</TooltipContent>
                  </Tooltip>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setIsOpen(false)}
                    aria-label="Close AI chat panel"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              {/* Sub-header: connector summary + analyze button */}
              <div className="px-3 py-2 border-b bg-muted/20 flex items-center justify-between gap-2">
                <div className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                  <MessageSquare className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{summaryLine}</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 py-0 border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10"
                      onClick={handleAnalyzeFinding}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      Analyze Finding
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Pre-fill a prompt with the focused finding&apos;s details
                  </TooltipContent>
                </Tooltip>
              </div>

              {/* Messages area */}
              <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-3 space-y-2.5 custom-scrollbar min-h-[12rem]"
              >
                {!connectorStatus && (
                  <div className="text-center py-6 px-3 rounded-md border border-dashed border-violet-500/30 bg-violet-500/5">
                    <WifiOff className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs font-semibold text-foreground mb-1">
                      No AI connector configured
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Open <strong>Admin → AI Connector Settings</strong> to set up
                      a local LLM (Ollama, llama.cpp, Ik_Llama.cpp, Opencode Desktop,
                      or any OpenAI-compatible endpoint). Use the keyboard shortcut
                      <span className="kbd-key mx-1">⌘</span>
                      <span className="kbd-key">⇧</span>
                      <span className="kbd-key">A</span> to jump there.
                    </p>
                  </div>
                )}

                {connectorStatus && !isConnected && connectorStatus.status !== 'error' && (
                  <div className="text-center py-4 px-3 rounded-md border border-amber-500/30 bg-amber-500/5">
                    <AlertCircle className="h-5 w-5 mx-auto mb-2 text-amber-500" />
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">
                      Connector not connected
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Start your local LLM server ({connectorStatus.type}) at
                      <code className="mx-1 px-1 py-0.5 bg-muted/60 rounded text-[10px]">
                        {connectorStatus.endpointUrl}
                      </code>
                      then click the refresh button above.
                    </p>
                  </div>
                )}

                {messages.length === 0 && connectorStatus && isConnected && (
                  <div className="text-center py-6 px-3">
                    <BrainCircuit className="h-8 w-8 mx-auto mb-2 text-violet-500/50" />
                    <p className="text-xs text-muted-foreground mb-2">
                      Chat with your local AI model
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 leading-snug">
                      Ask questions about audit findings, request code reviews,
                      or use <strong>Analyze Finding</strong> to get started.
                    </p>
                  </div>
                )}

                {messages.map((msg, idx) => (
                  <MessageBubble key={idx} message={msg} />
                ))}

                {isLoading && (
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-1">
                    <LoaderCircle className="h-3 w-3 animate-spin" />
                    <span>Waiting for response…</span>
                  </div>
                )}

                {error && canRetry && (
                  <div className="flex justify-center pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2 py-0"
                      onClick={retry}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry last message
                    </Button>
                  </div>
                )}
              </div>

              {/* Input area */}
              <div className="border-t p-2 space-y-1.5 bg-background/95">
                <Textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    connectorStatus
                      ? 'Ask about findings, code, fixes… (Enter to send, Shift+Enter for newline)'
                      : 'Configure a connector to start chatting…'
                  }
                  disabled={!connectorStatus || isLoading}
                  className="text-xs min-h-[44px] max-h-32 resize-none custom-scrollbar"
                  rows={2}
                />
                <div className="flex items-center justify-between gap-1.5">
                  <div className="text-[9px] text-muted-foreground/70 flex items-center gap-1">
                    <span className="kbd-key">⏎</span>
                    <span>send</span>
                    <span className="mx-1">·</span>
                    <span className="kbd-key">⇧</span>
                    <span className="kbd-key">⏎</span>
                    <span>newline</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {messages.length > 0 && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              clearChat()
                              toast.success('Chat cleared', { duration: 1500 })
                            }}
                            disabled={isLoading}
                            aria-label="Clear chat"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Clear conversation</TooltipContent>
                      </Tooltip>
                    )}
                    <Button
                      size="sm"
                      className="h-7 text-xs px-3 bg-violet-600 hover:bg-violet-700 text-white"
                      onClick={handleSend}
                      disabled={!connectorStatus || isLoading || !inputText.trim()}
                    >
                      {isLoading ? (
                        <><LoaderCircle className="h-3 w-3 mr-1 animate-spin" /> Sending</>
                      ) : (
                        <><Send className="h-3 w-3 mr-1" /> Send</>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

/* ─── Message bubble sub-component ─── */
function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user'
  const isAssistant = message.role === 'assistant'

  if (message.role === 'system') {
    return (
      <div className="text-center">
        <span className="inline-block text-[10px] text-muted-foreground bg-muted/40 px-2 py-0.5 rounded">
          {message.content}
        </span>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
          isUser
            ? 'bg-violet-600 text-white rounded-br-sm'
            : message.error
              ? 'bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 rounded-bl-sm'
              : 'bg-muted/60 text-foreground rounded-bl-sm'
        }`}
      >
        {isAssistant && !message.error && (
          <div className="flex items-center gap-1 mb-1 text-[9px] uppercase tracking-wide opacity-70">
            <BrainCircuit className="h-2.5 w-2.5" />
            <span>AI</span>
          </div>
        )}
        {message.pending ? (
          <div className="flex items-center gap-1.5 py-0.5">
            <LoaderCircle className="h-3 w-3 animate-spin opacity-70" />
            <span className="opacity-70">Thinking…</span>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
        )}
      </div>
    </div>
  )
}

export default AIChatPanel
