import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjectId } from '@/lib/get-active-project'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ task: string }> }
) {
  const { task } = await params
  try {
    const activeId = await getActiveProjectId(request)
    if (!activeId) {
      return NextResponse.json({ error: 'No active project found' }, { status: 400 })
    }

    const body = await request.json()

    // Use composite unique projectId_task for finding lookup
    const finding = await db.finding.update({
      where: { projectId_task: { projectId: activeId, task } },
      data: {
        title: body.title,
        tier: body.tier,
        severity: body.severity,
        category: body.category,
        summary: body.summary,
        claim: body.claim,
        evidence: body.evidence,
        verificationStatus: body.verificationStatus,
        verificationNote: body.verificationNote,
        dependsOn: body.dependsOn,
        findingIds: body.findingIds ? JSON.stringify(body.findingIds) : undefined,
        affectedFiles: body.affectedFiles
          ? JSON.stringify(body.affectedFiles)
          : undefined,
        unifiedModuleId: body.unifiedModuleId,
      },
      include: { proposals: true, codeSnippets: true },
    })
    return NextResponse.json({ finding })
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === 'P2025') {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to update finding' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ task: string }> }
) {
  const { task } = await params
  try {
    const activeId = await getActiveProjectId(request)
    if (!activeId) {
      return NextResponse.json({ error: 'No active project found' }, { status: 400 })
    }

    // Use composite unique projectId_task for finding lookup
    await db.finding.delete({ where: { projectId_task: { projectId: activeId, task } } })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && (error as Record<string, unknown>).code === 'P2025') {
      return NextResponse.json({ error: 'Finding not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to delete finding' }, { status: 500 })
  }
}
