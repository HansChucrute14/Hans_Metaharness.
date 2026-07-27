import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getActiveProjectId } from '@/lib/get-active-project'

// ── Opencode Harness Integration ──
// Opencode is an AI coding agent that exposes an OpenAPI 3.1 HTTP API
// on port 4096 (default) when started with `opencode serve` or via the Desktop App.
// This route enables the dashboard to communicate with that API programmatically.
// Now supports multi-project filtering via projectId.

// Helper: build a structured analysis prompt for an audit finding
function buildAnalysisPrompt(action: string, task: string | null, context: Record<string, unknown>): string {
  const actionDescriptions: Record<string, string> = {
    analyze: 'Analyze the following audit finding and provide a root cause analysis, impact assessment, and recommended fix strategy',
    fix: 'Implement a fix for the following audit finding. Provide the exact code changes needed, with file paths and line numbers',
    review: 'Review the current codebase state around this finding and check for related issues, edge cases, and potential regressions',
    test: 'Write comprehensive tests (unit, integration, or regression) for the fix related to this finding',
    refactor: 'Refactor the code related to this finding to improve maintainability, reduce complexity, and prevent similar issues',
  }
  const description = actionDescriptions[action] ?? `Perform ${action} on the following audit finding`
  const contextStr = Object.keys(context).length > 0 ? `\nContext: ${JSON.stringify(context, null, 2)}` : ''
  const taskStr = task ? `\nTask ID: ${task}` : ''

  return `${description}:\n${taskStr}${contextStr}`
}

// GET: Check Opencode availability and configuration, including live server health check
export async function GET(request: NextRequest) {
  const activeId = await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }

  // Check if Opencode settings exist in DB (filtered by project)
  const settings = await db.opencodeSetting.findUnique({
    where: { projectId: activeId },
  })

  if (!settings) {
    return NextResponse.json({
      configured: false,
      available: false,
      message: 'Opencode not configured. Install Opencode and configure in Admin tab.',
    })
  }

  const baseUrl = (settings.endpointUrl || 'http://localhost:4096').replace(/\/$/, '')

  // Try to reach the Opencode server's health endpoint
  let serverReachable = false
  let healthData: Record<string, unknown> | null = null
  try {
    const healthRes = await fetch(`${baseUrl}/global/health`, {
      signal: AbortSignal.timeout(5000),
    })
    if (healthRes.ok) {
      serverReachable = true
      try {
        healthData = await healthRes.json() as Record<string, unknown>
      } catch {
        // Health endpoint returned non-JSON — still reachable
      }
    }
  } catch {
    // Server not reachable — this is expected if Opencode isn't running
  }

  return NextResponse.json({
    configured: true,
    available: serverReachable && settings.isActive,
    settings: {
      id: settings.id,
      binaryPath: settings.binaryPath,
      workspacePath: settings.workspacePath,
      model: settings.model,
      endpointUrl: settings.endpointUrl,
      autoReview: settings.autoReview,
      syncToGithub: settings.syncToGithub,
      isActive: settings.isActive,
    },
    serverReachable,
    healthData,
    message: serverReachable && settings.isActive
      ? `Opencode server is reachable at ${baseUrl} with model ${settings.model}`
      : settings.isActive && !serverReachable
        ? `Opencode is configured at ${baseUrl} but the server is not reachable. Start it with: opencode serve --port 4096`
        : 'Opencode configured but not active',
  })
}

// POST: Send a task to Opencode for AI-driven analysis/fix — uses the HTTP API when available
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { action, task, context, projectId } = body as {
    action?: string
    task?: string
    context?: Record<string, unknown>
    projectId?: string
  }

  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 })
  }

  const validActions = ['analyze', 'fix', 'review', 'test', 'refactor']
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `Unknown action: ${action}. Available: ${validActions.join(', ')}` }, { status: 400 })
  }

  const activeId = projectId ?? await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }

  // Find settings for this project
  const settings = await db.opencodeSetting.findUnique({
    where: { projectId: activeId },
  })

  if (!settings || !settings.isActive) {
    return NextResponse.json({ error: 'Opencode not configured or not active' }, { status: 400 })
  }

  const baseUrl = (settings.endpointUrl || 'http://localhost:4096').replace(/\/$/, '')
  const prompt = buildAnalysisPrompt(action, task ?? null, context ?? {})

  // ── Step 1: Check if the Opencode server is reachable ──
  let serverReachable = false
  try {
    const healthRes = await fetch(`${baseUrl}/global/health`, {
      signal: AbortSignal.timeout(5000),
    })
    serverReachable = healthRes.ok
  } catch {
    serverReachable = false
  }

  // ── If server is not reachable — queue action for manual execution ──
  if (!serverReachable) {
    try {
      await db.opencodeAction.create({
        data: {
          action,
          task: task ?? null,
          prompt,
          contextJson: JSON.stringify(context ?? {}),
          status: 'queued',
          settingsId: settings.id,
          projectId: activeId,
        },
      })
    } catch { /* ignore if model doesn't exist yet */ }

    const manualCommand = `cd ${settings.workspacePath} && opencode run "${prompt.replace(/"/g, '\\"')}"`
    return NextResponse.json({
      live: false,
      queued: true,
      action,
      task: task ?? null,
      prompt,
      message: `Opencode server not reachable at ${baseUrl}. Action queued for manual execution.`,
      manualCommand,
      instructions: {
        manualCommand,
        autoSync: settings.syncToGithub
          ? 'Changes will be automatically synced to GitHub'
          : 'Manual sync required — changes will appear in local workspace only',
      },
    })
  }

  // ── If server is reachable — create session and send prompt via HTTP API ──
  if (action === 'analyze' || action === 'fix' || action === 'review' || action === 'test' || action === 'refactor') {
    try {
      // Create a session
      const sessionRes = await fetch(`${baseUrl}/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Audit: ${action} — Task ${task ?? 'general'}` }),
        signal: AbortSignal.timeout(10000),
      })

      if (!sessionRes.ok) {
        // Session creation failed — queue action for manual execution
        try {
          await db.opencodeAction.create({
            data: {
              action,
              task: task ?? null,
              prompt,
              contextJson: JSON.stringify(context ?? {}),
              status: 'queued',
              settingsId: settings.id,
              projectId: activeId,
            },
          })
        } catch { /* ignore */ }

        return NextResponse.json({
          live: false,
          queued: true,
          action,
          task: task ?? null,
          message: `Opencode session creation failed (${sessionRes.status}). Action queued for manual execution.`,
          manualCommand: `cd ${settings.workspacePath} && opencode run "${prompt.replace(/"/g, '\\"')}"`,
        })
      }

      const session = await sessionRes.json() as { id: string }
      const sessionId = session.id

      // Decide whether to use synchronous or async prompt
      const useSync = action === 'analyze' || action === 'review'

      if (useSync) {
        // Synchronous prompt — waits for AI response and returns it
        const messageRes = await fetch(`${baseUrl}/session/${sessionId}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parts: [{ type: 'text', text: prompt }],
          }),
          signal: AbortSignal.timeout(120000), // 2min timeout for AI response
        })

        // Log the action in the DB
        try {
          await db.opencodeAction.create({
            data: {
              action,
              task: task ?? null,
              prompt,
              contextJson: JSON.stringify(context ?? {}),
              status: messageRes.ok ? 'completed' : 'queued',
              sessionId,
              settingsId: settings.id,
              projectId: activeId,
            },
          })
        } catch { /* ignore */ }

        if (!messageRes.ok) {
          return NextResponse.json({
            live: true,
            queued: false,
            sessionId,
            action,
            task: task ?? null,
            prompt,
            message: `Session ${sessionId} created but synchronous prompt failed (${messageRes.status}). The session is available in Opencode.`,
          })
        }

        const messageData = await messageRes.json()
        // Extract the AI response from the message data
        const reply = extractOpencodeReply(messageData)

        return NextResponse.json({
          live: true,
          queued: false,
          sessionId,
          action,
          task: task ?? null,
          prompt,
          reply,
          message: `Analysis completed via Opencode session ${sessionId}.`,
          rawResponse: messageData,
        })
      } else {
        // Async prompt — non-blocking, response must be retrieved later
        const promptRes = await fetch(`${baseUrl}/session/${sessionId}/prompt_async`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parts: [{ type: 'text', text: prompt }],
          }),
          signal: AbortSignal.timeout(15000),
        })

        // Log the action in the DB
        try {
          await db.opencodeAction.create({
            data: {
              action,
              task: task ?? null,
              prompt,
              contextJson: JSON.stringify(context ?? {}),
              status: promptRes.ok ? 'running' : 'queued',
              sessionId,
              settingsId: settings.id,
              projectId: activeId,
            },
          })
        } catch { /* ignore */ }

        return NextResponse.json({
          live: true,
          queued: false,
          sessionId,
          action,
          task: task ?? null,
          prompt,
          message: promptRes.ok
            ? `Prompt sent to Opencode session ${sessionId} for action "${action}". Use the session ID to retrieve results later.`
            : `Session ${sessionId} created but prompt delivery failed (${promptRes.status}). Check the Opencode Desktop App or CLI for the session.`,
        })
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error communicating with Opencode'
      // Fall back to queueing
      try {
        await db.opencodeAction.create({
          data: {
            action,
            task: task ?? null,
            prompt,
            contextJson: JSON.stringify(context ?? {}),
            status: 'queued',
            settingsId: settings.id,
            projectId: activeId,
          },
        })
      } catch { /* ignore */ }

      return NextResponse.json({
        live: false,
        queued: true,
        action,
        task: task ?? null,
        message: `Error communicating with Opencode: ${errorMessage}. Action queued for manual execution.`,
        manualCommand: `cd ${settings.workspacePath} && opencode run "${prompt.replace(/"/g, '\\"')}"`,
      })
    }
  }

// Fallback for unknown action types (shouldn't reach here due to validation above)
  return NextResponse.json({ error: `Unhandled action: ${action}` }, { status: 400 })
}

// ── Helper: Extract text reply from an Opencode API response ──
function extractOpencodeReply(data: unknown): string {
  if (typeof data === 'string') return data

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>

    // Direct content field
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.message === 'string') return obj.message

    // Parts array (Opencode multi-part response)
    if (Array.isArray(obj.parts)) {
      return obj.parts
        .filter((p: unknown) => typeof p === 'object' && (p as Record<string, unknown>).type === 'text')
        .map((p: unknown) => ((p as Record<string, unknown>).text as string) ?? '')
        .join('\n')
    }

    // Nested message object
    if (obj.message && typeof obj.message === 'object') {
      const msg = obj.message as Record<string, unknown>
      if (typeof msg.content === 'string') return msg.content
    }

    // Choices array (OpenAI-compatible format)
    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const choice = obj.choices[0] as Record<string, unknown>
      if (choice.message && typeof choice.message === 'object') {
        const msg = choice.message as Record<string, unknown>
        if (typeof msg.content === 'string') return msg.content
      }
    }

    // Info object with content
    if (obj.info && typeof obj.info === 'object') {
      const info = obj.info as Record<string, unknown>
      if (typeof info.content === 'string') return info.content
    }
  }

  return ''
}

// PUT: Update Opencode settings (scoped by projectId)
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const {
    binaryPath,
    workspacePath,
    model,
    endpointUrl,
    autoReview,
    syncToGithub,
    isActive,
    projectId,
  } = body as {
    binaryPath?: string
    workspacePath?: string
    model?: string
    endpointUrl?: string
    autoReview?: boolean
    syncToGithub?: boolean
    isActive?: boolean
    projectId?: string
  }

  const activeId = projectId ?? await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }

  try {
    // Find existing settings for this project
    const existing = await db.opencodeSetting.findUnique({
      where: { projectId: activeId },
    })

    let settings
    if (existing) {
      settings = await db.opencodeSetting.update({
        where: { id: existing.id },
        data: {
          binaryPath: binaryPath ?? existing.binaryPath,
          workspacePath: workspacePath ?? existing.workspacePath,
          model: model ?? existing.model,
          endpointUrl: endpointUrl ?? existing.endpointUrl,
          autoReview: autoReview ?? existing.autoReview,
          syncToGithub: syncToGithub ?? existing.syncToGithub,
          isActive: isActive ?? existing.isActive,
          updatedAt: new Date(),
        },
      })
    } else {
      settings = await db.opencodeSetting.create({
        data: {
          binaryPath: binaryPath ?? 'opencode',
          workspacePath: workspacePath ?? process.cwd(),
          model: model ?? 'claude-sonnet-4-20250514',
          endpointUrl: endpointUrl ?? 'http://localhost:4096',
          autoReview: autoReview ?? false,
          syncToGithub: syncToGithub ?? true,
          isActive: isActive ?? false,
          projectId: activeId,
        },
      })
    }

    return NextResponse.json({ settings })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE: Remove Opencode settings (scoped by projectId)
export async function DELETE(request: NextRequest) {
  try {
    const activeId = await getActiveProjectId(request)
    if (!activeId) {
      return NextResponse.json({ error: 'No active project found' }, { status: 400 })
    }

    const existing = await db.opencodeSetting.findUnique({
      where: { projectId: activeId },
    })

    if (existing) {
      await db.opencodeSetting.delete({ where: { id: existing.id } })
    }
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
