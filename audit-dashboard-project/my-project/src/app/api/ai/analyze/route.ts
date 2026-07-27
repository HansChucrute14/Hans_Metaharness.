import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { PrismaClient } from '@prisma/client'
import { getActiveProjectId } from '@/lib/get-active-project'
import { db } from '@/lib/db'

// Use a fresh PrismaClient to avoid stale singleton issues with newly-added AIConnector model
const prisma = new PrismaClient()

// The prompt template used for both cloud and local AI
function buildAnalysisPrompt(data: {
  task: string
  title: string
  severity?: string
  tier?: string
  claim?: string
  evidence?: string
  affectedFiles?: string[]
  proposals?: Array<Record<string, unknown>>
  projectName?: string
}): string {
  return `You are an expert software auditor analyzing a finding from the ${data.projectName ?? 'the active'} project.

FINDING: Task ${data.task}: ${data.title}
Severity: ${data.severity ?? 'N/A'} | Tier: ${data.tier ?? 'N/A'}
Claim: ${data.claim ?? 'N/A'}
Evidence: ${data.evidence ?? 'N/A'}
Affected Files: ${data.affectedFiles?.join(', ') || 'N/A'}
Proposals available: ${data.proposals?.map((p, i) => `${i + 1}. ${p.title}: ${p.description}`).join('\n') || 'N/A'}

Please provide:
1. **Root Cause Analysis**: What is the deepest underlying cause of this bug?
2. **Impact Assessment**: What could go wrong in production if this is not fixed?
3. **Recommended Fix Strategy**: Which proposal is best and why? Any improvements?
4. **Testing Strategy**: How should the fix be tested?
5. **Dependency Risks**: What other findings might block or interact with this fix?

Be concise, technical, and specific. Reference actual code paths where possible.`
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { task, title, claim, evidence, proposals, affectedFiles, severity, tier, projectId } = body as Record<string, unknown>

  if (!task || !title) {
    return NextResponse.json({ error: 'task and title are required' }, { status: 400 })
  }

  // Resolve projectId for project context — required for project-scoped queries
  const activeId = (projectId as string) ?? await getActiveProjectId(request)
  if (!activeId) {
    return NextResponse.json({ error: 'No active project found' }, { status: 400 })
  }

  // Get project name for the prompt context
  let projectName = 'the active project'
  if (activeId) {
    const project = await db.project.findUnique({ where: { id: activeId } })
    if (project) {
      projectName = project.name
    }
  }

  const prompt = buildAnalysisPrompt({
    task: String(task),
    title: String(title),
    severity: severity as string | undefined,
    tier: tier as string | undefined,
    claim: claim as string | undefined,
    evidence: evidence as string | undefined,
    affectedFiles: affectedFiles as string[] | undefined,
    proposals: proposals as Array<Record<string, unknown>> | undefined,
    projectName,
  })

  // ── Check if a local AI connector is active ──
  try {
    const activeConnector = await prisma.aIConnector.findFirst({ where: { isActive: true } })

    if (activeConnector) {
      // ── Use local LLM ──
      try {
        const analysis = await proxyToLocalLLM(activeConnector, prompt)
        return NextResponse.json({ analysis, source: `local:${activeConnector.name}` })
      } catch (localErr) {
        const localMessage = localErr instanceof Error ? localErr.message : 'Local LLM failed'
        console.error('Local AI analysis error:', localMessage)
        // Fall back to cloud AI if local fails
        console.warn('Falling back to cloud AI due to local LLM failure')
      }
    }

    // ── Use cloud AI (z-ai-web-dev-sdk) ──
    const zai = await ZAI.create()
    const response = await zai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      thinking: { type: 'disabled' },
    })
    const analysis = response.choices?.[0]?.message?.content ?? 'No analysis generated.'
    return NextResponse.json({ analysis, source: 'cloud', projectId: activeId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('AI analysis error:', message)
    return NextResponse.json({ error: `AI analysis failed: ${message}` }, { status: 500 })
  }
}

// ── Proxy request to a local LLM endpoint ──
async function proxyToLocalLLM(
  connector: {
    type: string
    endpointUrl: string
    modelName: string | null
    temperature: number
    maxTokens: number
  },
  prompt: string
): Promise<string> {
  const url = connector.endpointUrl.replace(/\/$/, '')

  if (connector.type === 'ollama') {
    // ── Ollama API format: /api/chat ──
    const model = connector.modelName ?? 'llama3'
    const res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: {
          temperature: connector.temperature,
          num_predict: connector.maxTokens,
        },
      }),
      signal: AbortSignal.timeout(120000), // 2 min timeout for potentially slow local models
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Ollama responded with ${res.status}: ${errText}`)
    }

    const data = await res.json() as { message?: { content?: string }; response?: string }
    const analysis = data.message?.content ?? data.response ?? ''
    if (!analysis) throw new Error('Ollama returned empty response')
    return analysis
  }

  if (connector.type === 'openai-compatible' || connector.type === 'custom') {
    // ── OpenAI-compatible format: /v1/chat/completions ──
    const model = connector.modelName ?? 'default'
    const res = await fetch(`${url}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: connector.temperature,
        max_tokens: connector.maxTokens,
        stream: false,
      }),
      signal: AbortSignal.timeout(120000),
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`OpenAI-compatible endpoint responded with ${res.status}: ${errText}`)
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const analysis = data.choices?.[0]?.message?.content ?? ''
    if (!analysis) throw new Error('OpenAI-compatible endpoint returned empty response')
    return analysis
  }

  throw new Error(`Unknown connector type: ${connector.type}`)
}
