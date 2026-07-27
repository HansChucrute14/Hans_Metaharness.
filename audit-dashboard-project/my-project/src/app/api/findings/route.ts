import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjectId } from '@/lib/get-active-project'

// GET: Fetch all findings with related data (for client-side data loading)
export async function GET(request: NextRequest) {
  try {
    const activeId = await getActiveProjectId(request)
    if (!activeId) {
      return NextResponse.json({ error: 'No active project found' }, { status: 400 })
    }

    const findings = await db.finding.findMany({
      where: { projectId: activeId },
      include: {
        proposals: { orderBy: { index: 'asc' } },
        codeSnippets: true,
        bestAnalysis: true,
        module: true,
      },
      orderBy: { task: 'asc' },
    })

    // Deserialize JSON fields back to arrays
    const deserializedFindings = findings.map(f => ({
      ...f,
      findingIds: JSON.parse(f.findingIds),
      affectedFiles: JSON.parse(f.affectedFiles),
      module: f.module ? {
        ...f.module,
        addresses: JSON.parse(f.module.addresses),
        fixes: JSON.parse(f.module.fixes),
      } : null,
    }))

    // Also fetch analyses separately for convenience (filtered by project's findings)
    const findingIds = findings.map(f => f.id)
    const analyses = await db.bestProposalAnalysis.findMany({
      where: { findingId: { in: findingIds } },
    })

    return NextResponse.json({
      findings: deserializedFindings,
      analyses,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to fetch findings', details: message },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      task,
      findingIds,
      title,
      tier,
      severity,
      category,
      summary,
      claim,
      evidence,
      verificationStatus,
      verificationNote,
      dependsOn,
      affectedFiles,
      proposals,
      codeSnippets,
      unifiedModuleId,
      projectId,
    } = body

    // Validate required fields
    if (!task || !title || !tier || !severity || !category || !summary) {
      return NextResponse.json(
        { error: 'Missing required fields: task, title, tier, severity, category, summary' },
        { status: 400 }
      )
    }

    const activeId = projectId ?? await getActiveProjectId(request)
    if (!activeId) {
      return NextResponse.json({ error: 'No active project found' }, { status: 400 })
    }

    const finding = await db.finding.create({
      data: {
        task: String(task),
        findingIds: JSON.stringify(findingIds || []),
        title,
        tier,
        severity,
        category,
        summary,
        claim: claim || '',
        evidence: evidence || '',
        verificationStatus: verificationStatus || 'confirmed-execution',
        verificationNote: verificationNote || null,
        dependsOn: dependsOn || 'None',
        affectedFiles: JSON.stringify(affectedFiles || []),
        unifiedModuleId: unifiedModuleId || null,
        projectId: activeId,
        proposals: {
          create: (proposals || []).map((p: Record<string, unknown>, i: number) => ({
            index: i,
            title: (p.title as string) || '',
            description: (p.description as string) || '',
            effort: (p.effort as string) || 'medium',
            risk: (p.risk as string) || 'medium',
            reversible: p.reversible !== undefined ? Boolean(p.reversible) : true,
          })),
        },
        codeSnippets: {
          create: (codeSnippets || []).map((s: Record<string, unknown>) => ({
            file: (s.file as string) || '',
            lines: (s.lines as string) || '',
            language: (s.language as string) || 'python',
            code: (s.code as string) || '',
          })),
        },
      },
      include: {
        proposals: true,
        codeSnippets: true,
      },
    })

    return NextResponse.json({ finding }, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === 'P2002') {
      return NextResponse.json(
        { error: `Finding with task "${(error as Record<string, unknown>).meta}" already exists in this project` },
        { status: 409 }
      )
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to create finding', details: message },
      { status: 500 }
    )
  }
}
