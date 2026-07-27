import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjectId } from '@/lib/get-active-project'

// PUT: Save/update an audit note for a finding
// Since AuditNote now uses findingId FK (not task), we first find the Finding
// by composite unique, then query/upsert AuditNote by findingId.
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

    // Find the Finding by composite unique (projectId_task)
    const finding = await db.finding.findUnique({
      where: { projectId_task: { projectId: activeId, task } },
    })

    if (!finding) {
      return NextResponse.json({ error: `Finding "${task}" not found in active project` }, { status: 404 })
    }

    // Upsert AuditNote by findingId FK
    // Check if an existing note exists for this findingId
    const existingNote = await db.auditNote.findFirst({
      where: { findingId: finding.id },
    })

    if (existingNote) {
      const note = await db.auditNote.update({
        where: { id: existingNote.id },
        data: {
          note: body.note || '',
          status: body.status || 'not-started',
        },
      })
      return NextResponse.json({ note })
    } else {
      const note = await db.auditNote.create({
        data: {
          findingId: finding.id,
          note: body.note || '',
          status: body.status || 'not-started',
        },
      })
      return NextResponse.json({ note })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Failed to save note: ${message}` }, { status: 500 })
  }
}
