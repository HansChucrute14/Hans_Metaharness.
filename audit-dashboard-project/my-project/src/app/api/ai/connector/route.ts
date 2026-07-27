import { NextRequest, NextResponse } from 'next/server'
import { PrismaClient } from '@prisma/client'

// Use a dedicated PrismaClient for the connector route to avoid stale singleton issues
// when the AIConnector model was added after the initial client was cached
const prisma = new PrismaClient()

// ── GET: List all connectors and/or list available models from a connected endpoint ──
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // If action=list-models, fetch available models from a specific connector's endpoint
  if (action === 'list-models') {
    const connectorName = searchParams.get('connector') ?? 'ollama'
    const connector = await prisma.aIConnector.findUnique({ where: { name: connectorName } })
    if (!connector) {
      return NextResponse.json({ error: 'Connector not found' }, { status: 404 })
    }

    try {
      const models = await fetchAvailableModels(connector.endpointUrl, connector.type)
      return NextResponse.json({ models, connectorName: connector.name, endpointUrl: connector.endpointUrl })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list models'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // Default: return all connectors with their current status
  const connectors = await prisma.aIConnector.findMany({ orderBy: { createdAt: 'asc' } })
  return NextResponse.json({ connectors })
}

// ── POST: Test connection to a local LLM endpoint, OR send a chat request ──
// The POST body may include an `action` field:
//   - action: 'chat'  → proxy a chat completion to the active/selected connector
//   - default (no action) → test connection to {endpointUrl, type}
export async function POST(request: NextRequest) {
  const body = await request.json()

  // ── Chat action: forward messages to the active or named connector ──
  if ((body as Record<string, unknown>).action === 'chat') {
    const {
      connectorName,
      messages,
      model,
      temperature,
      maxTokens,
    } = body as {
      action: 'chat'
      connectorName?: string
      messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
      model?: string
      temperature?: number
      maxTokens?: number
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages array is required for chat action' }, { status: 400 })
    }

    // Resolve the connector: prefer the named one, fall back to the active one
    let connector = connectorName
      ? await prisma.aIConnector.findUnique({ where: { name: connectorName } })
      : null
    if (!connector) {
      connector = await prisma.aIConnector.findFirst({ where: { isActive: true } })
    }
    if (!connector) {
      return NextResponse.json(
        { error: 'No active AI connector configured. Open the Admin tab → AI Connector to set one up.' },
        { status: 404 },
      )
    }

    try {
      const reply = await proxyChatToConnector({
        connector,
        messages,
        model: model ?? connector.modelName ?? undefined,
        temperature: temperature ?? connector.temperature,
        maxTokens: maxTokens ?? connector.maxTokens,
      })
      return NextResponse.json({
        reply,
        connectorName: connector.name,
        model: model ?? connector.modelName ?? '',
        source: `local:${connector.name}`,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Chat request failed'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // ── Default action: test connection to a local LLM endpoint ──
  const { endpointUrl, type } = body as { endpointUrl?: string; type?: string }

  if (!endpointUrl) {
    return NextResponse.json({ error: 'endpointUrl is required' }, { status: 400 })
  }

  const connectorType = type ?? 'ollama'

  try {
    const result = await testConnection(endpointUrl, connectorType)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection test failed'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

// ── Helper: Proxy a chat completion to a local LLM endpoint ──
async function proxyChatToConnector({
  connector,
  messages,
  model,
  temperature,
  maxTokens,
}: {
  connector: {
    type: string
    endpointUrl: string
    modelName: string | null
    temperature: number
    maxTokens: number
  }
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const url = connector.endpointUrl.replace(/\/$/, '')
  const effectiveModel = model ?? connector.modelName ?? 'llama3'
  const effectiveTemp = temperature ?? connector.temperature
  const effectiveMaxTokens = maxTokens ?? connector.maxTokens

  // Ollama API format: /api/chat
  if (connector.type === 'ollama') {
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        stream: false,
        options: {
          temperature: effectiveTemp,
          num_predict: effectiveMaxTokens,
        },
      }),
      signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Ollama responded with ${res.status}: ${errText}`)
    }
    const data = await res.json() as { message?: { content?: string }; response?: string }
    const reply = data.message?.content ?? data.response ?? ''
    if (!reply) throw new Error('Ollama returned empty response')
    return reply
  }

  // Opencode Desktop / Server → use session API to send prompt and get response
  if (connector.type === 'opencode-desktop') {
    // Create a session on the Opencode server
    const sessionRes = await fetch(`${url}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Dashboard Chat: ${new Date().toISOString()}` }),
      signal: AbortSignal.timeout(10000),
    })
    if (!sessionRes.ok) {
      const errText = await sessionRes.text()
      throw new Error(`Opencode session creation failed with ${sessionRes.status}: ${errText}`)
    }
    const sessionData = await sessionRes.json() as { id: string }
    const sessionId = sessionData.id

    // Concatenate messages into a single prompt for Opencode
    const promptText = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n')

    // Send the prompt synchronously (we need the response for chat)
    const promptRes = await fetch(`${url}/session/${sessionId}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts: [{ type: 'text', text: promptText }],
      }),
      signal: AbortSignal.timeout(120000),
    })
    if (!promptRes.ok) {
      const errText = await promptRes.text()
      throw new Error(`Opencode prompt failed with ${promptRes.status}: ${errText}`)
    }
    const promptData = await promptRes.json()
    // The Opencode API response format varies; extract text content
    const reply = extractOpencodeReply(promptData)
    if (!reply) throw new Error('Opencode returned empty response')
    return reply
  }

  // OpenAI-compatible / llamacpp / ik_llamacpp / custom → /v1/chat/completions
  if (
    connector.type === 'openai-compatible' ||
    connector.type === 'llamacpp' ||
    connector.type === 'ik_llamacpp' ||
    connector.type === 'custom'
  ) {
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: effectiveModel,
        messages,
        temperature: effectiveTemp,
        max_tokens: effectiveMaxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(120000),
    })
    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Endpoint responded with ${res.status}: ${errText}`)
    }
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const reply = data.choices?.[0]?.message?.content ?? ''
    if (!reply) throw new Error('Endpoint returned empty response')
    return reply
  }

  throw new Error(`Unknown connector type: ${connector.type}`)
}

// ── PUT: Save/update connector settings ──
export async function PUT(request: NextRequest) {
  const body = await request.json()
  const {
    name,
    type,
    endpointUrl,
    modelName,
    temperature,
    maxTokens,
    isActive,
  } = body as {
    name: string
    type: string
    endpointUrl: string
    modelName?: string
    temperature?: number
    maxTokens?: number
    isActive?: boolean
  }

  if (!name || !type || !endpointUrl) {
    return NextResponse.json({ error: 'name, type, and endpointUrl are required' }, { status: 400 })
  }

  try {
    // If activating this connector, deactivate all others first (only one active at a time)
    if (isActive) {
      await prisma.aIConnector.updateMany({
        where: { isActive: true },
        data: { isActive: false },
      })
    }

    const connector = await prisma.aIConnector.upsert({
      where: { name },
      update: {
        type,
        endpointUrl,
        modelName: modelName ?? null,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
        isActive: isActive ?? false,
        updatedAt: new Date(),
      },
      create: {
        name,
        type,
        endpointUrl,
        modelName: modelName ?? null,
        temperature: temperature ?? 0.7,
        maxTokens: maxTokens ?? 4096,
        isActive: isActive ?? false,
        status: 'disconnected',
      },
    })

    return NextResponse.json({ connector })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save connector'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── DELETE: Remove a connector ──
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  if (!name) {
    return NextResponse.json({ error: 'name parameter is required' }, { status: 400 })
  }

  try {
    await prisma.aIConnector.delete({ where: { name } })
    return NextResponse.json({ deleted: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete connector'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── Helper: Test connection to an LLM endpoint ──
async function testConnection(endpointUrl: string, type: string): Promise<{
  success: boolean
  message: string
  models?: string[]
  endpointUrl: string
}> {
  const url = endpointUrl.replace(/\/$/, '')

  try {
    if (type === 'ollama') {
      // Ollama: ping /api/version to check it's running, then /api/tags for models
      const versionRes = await fetch(`${url}/api/version`, { signal: AbortSignal.timeout(5000) })
      if (!versionRes.ok) {
        return { success: false, message: `Ollama responded with status ${versionRes.status}`, endpointUrl }
      }

      const tagsRes = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) })
      let models: string[] = []
      if (tagsRes.ok) {
        const tagsData = await tagsRes.json() as { models?: Array<{ name: string }> }
        models = tagsData.models?.map(m => m.name) ?? []
      }

      // Update connector status if it exists
      try {
        await prisma.aIConnector.updateMany({
          where: { endpointUrl },
          data: { status: 'connected', lastPingAt: new Date() },
        })
      } catch { /* ignore if connector doesn't exist yet */ }

      return { success: true, message: `Ollama connected — ${models.length} models available`, models, endpointUrl }
    }

    if (type === 'opencode-desktop') {
      // Opencode Server: ping /global/health, then /provider for model info
      const healthRes = await fetch(`${url}/global/health`, { signal: AbortSignal.timeout(5000) })
      if (!healthRes.ok) {
        return { success: false, message: `Opencode server not reachable (status ${healthRes.status}). Make sure 'opencode serve' is running on port 4096.`, endpointUrl }
      }

      // Try to fetch providers/models from the Opencode server
      let models: string[] = []
      try {
        const providerRes = await fetch(`${url}/provider`, { signal: AbortSignal.timeout(5000) })
        if (providerRes.ok) {
          const providerData = await providerRes.json()
          // The provider endpoint returns configured providers and their models
          // Extract model names from the provider data
          models = extractOpencodeModels(providerData)
        }
      } catch { /* provider endpoint may not be available */ }

      try {
        await prisma.aIConnector.updateMany({
          where: { endpointUrl },
          data: { status: 'connected', lastPingAt: new Date() },
        })
      } catch { /* ignore */ }

      return { success: true, message: `Opencode server connected at ${url} — ${models.length} providers configured`, models, endpointUrl }
    }

    if (type === 'openai-compatible' || type === 'llamacpp' || type === 'ik_llamacpp') {
      // OpenAI-compatible (LM Studio, llama.cpp, Ik_Llama.cpp, etc.): ping /v1/models
      const modelsRes = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) })
      if (!modelsRes.ok) {
        return { success: false, message: `Endpoint responded with status ${modelsRes.status}`, endpointUrl }
      }

      const modelsData = await modelsRes.json() as { data?: Array<{ id: string }> }
      const models = modelsData.data?.map(m => m.id) ?? []

      try {
        await prisma.aIConnector.updateMany({
          where: { endpointUrl },
          data: { status: 'connected', lastPingAt: new Date() },
        })
      } catch { /* ignore */ }

      const labelMap: Record<string, string> = {
        'openai-compatible': 'OpenAI-compatible',
        'llamacpp': 'llama.cpp',
        'ik_llamacpp': 'Ik_Llama.cpp',
      }
      const label = labelMap[type] ?? 'OpenAI-compatible'
      return { success: true, message: `${label} endpoint connected — ${models.length} models available`, models, endpointUrl }
    }

    // Custom type: just try to fetch the base URL
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      return { success: false, message: `Endpoint responded with status ${res.status}`, endpointUrl }
    }

    try {
      await prisma.aIConnector.updateMany({
        where: { endpointUrl },
        data: { status: 'connected', lastPingAt: new Date() },
      })
    } catch { /* ignore */ }

    return { success: true, message: 'Custom endpoint reachable', endpointUrl }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Connection failed'

    try {
      await prisma.aIConnector.updateMany({
        where: { endpointUrl },
        data: { status: 'error' },
      })
    } catch { /* ignore */ }

    return { success: false, message, endpointUrl }
  }
}

// ── Helper: Fetch available models from an endpoint ──
async function fetchAvailableModels(endpointUrl: string, type: string): Promise<string[]> {
  const url = endpointUrl.replace(/\/$/, '')

  if (type === 'ollama') {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`Failed to fetch Ollama models: ${res.status}`)
    const data = await res.json() as { models?: Array<{ name: string }> }
    return data.models?.map(m => m.name) ?? []
  }

  if (type === 'opencode-desktop') {
    // Opencode Server: use /provider endpoint to list available providers/models
    try {
      const providerRes = await fetch(`${url}/provider`, { signal: AbortSignal.timeout(5000) })
      if (providerRes.ok) {
        const providerData = await providerRes.json()
        return extractOpencodeModels(providerData)
      }
    } catch { /* fall through */ }
    // If /provider fails, return empty — Opencode doesn't use a /v1/models endpoint
    return []
  }

  if (type === 'openai-compatible' || type === 'llamacpp' || type === 'ik_llamacpp') {
    const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`)
    const data = await res.json() as { data?: Array<{ id: string }> }
    return data.data?.map(m => m.id) ?? []
  }

  // Custom: try OpenAI-compatible format first, then Ollama format
  try {
    const res = await fetch(`${url}/v1/models`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json() as { data?: Array<{ id: string }> }
      return data.data?.map(m => m.id) ?? []
    }
  } catch { /* try Ollama next */ }

  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const data = await res.json() as { models?: Array<{ name: string }> }
      return data.models?.map(m => m.name) ?? []
    }
  } catch { /* fallback */ }

  return []
}

// ── Helper: Extract text reply from an Opencode API response ──
// The Opencode API returns structured data that may contain the AI response
// in various formats depending on the endpoint used.
function extractOpencodeReply(data: unknown): string {
  if (typeof data === 'string') return data

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>

    // Common patterns in Opencode responses:
    // 1. Direct content field
    if (typeof obj.content === 'string') return obj.content
    if (typeof obj.text === 'string') return obj.text
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.response === 'string') return obj.response
    if (typeof obj.output === 'string') return obj.output

    // 2. Nested message object (like OpenAI format)
    if (obj.message && typeof obj.message === 'object') {
      const msg = obj.message as Record<string, unknown>
      if (typeof msg.content === 'string') return msg.content
      if (typeof msg.text === 'string') return msg.text
    }

    // 3. Parts array (Opencode multi-part response)
    if (Array.isArray(obj.parts)) {
      return obj.parts
        .filter((p: unknown) => typeof p === 'object' && (p as Record<string, unknown>).type === 'text')
        .map((p: unknown) => ((p as Record<string, unknown>).text as string) ?? '')
        .join('\n')
    }

    // 4. Choices array (if Opencode returns OpenAI-compatible format)
    if (Array.isArray(obj.choices) && obj.choices.length > 0) {
      const choice = obj.choices[0] as Record<string, unknown>
      if (choice.message && typeof choice.message === 'object') {
        const msg = choice.message as Record<string, unknown>
        if (typeof msg.content === 'string') return msg.content
      }
    }

    // 5. Last resort: stringify and return (useful for debugging)
    const jsonStr = JSON.stringify(data)
    if (jsonStr && jsonStr.length > 0 && jsonStr !== '{}') return jsonStr
  }

  return ''
}

// ── Helper: Extract model/provider names from Opencode /provider response ──
// The Opencode /provider endpoint returns provider configuration data.
// We extract the provider IDs and model IDs to populate the models list.
function extractOpencodeModels(data: unknown): string[] {
  const models: string[] = []

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>

    // If it's an array of providers
    if (Array.isArray(obj)) {
      for (const item of obj) {
        if (typeof item === 'object' && item !== null) {
          const provider = item as Record<string, unknown>
          if (typeof provider.id === 'string') models.push(provider.id)
          if (typeof provider.name === 'string') models.push(provider.name)
          // Nested models within a provider
          if (Array.isArray(provider.models)) {
            for (const m of provider.models as Array<unknown>) {
              if (typeof m === 'string') models.push(m)
              if (typeof m === 'object' && m !== null) {
                const modelObj = m as Record<string, unknown>
                if (typeof modelObj.id === 'string') models.push(modelObj.id)
                if (typeof modelObj.name === 'string') models.push(modelObj.name)
              }
            }
          }
        }
      }
    }

    // If providers are in a keyed object (e.g. { providers: [...] })
    if (Array.isArray(obj.providers)) {
      for (const provider of obj.providers as Array<unknown>) {
        if (typeof provider === 'object' && provider !== null) {
          const p = provider as Record<string, unknown>
          if (typeof p.id === 'string') models.push(p.id)
          if (typeof p.name === 'string') models.push(p.name)
        }
      }
    }

    // If providers are in a keyed map (e.g. { anthropic: {...}, openai: {...} })
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'providers' || key === 'models') continue // already handled
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        models.push(key) // The key itself is the provider name
      }
    }
  }

  return models
}
