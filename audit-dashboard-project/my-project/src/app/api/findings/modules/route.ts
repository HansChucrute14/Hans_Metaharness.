import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjectId } from '@/lib/get-active-project'

// Modules endpoint — reads g3_blocked from AuditConfig instead of hardcoding
// Filters modules by project's findings
export async function GET(request: NextRequest) {
  try {
    const activeId = await getActiveProjectId(request)
    if (!activeId) {
      return NextResponse.json({ error: 'No active project found' }, { status: 400 })
    }

    const modules = await db.unifiedExecutionModule.findMany({
      include: {
        findings: {
          where: { projectId: activeId },
          include: {
            proposals: { orderBy: { index: 'asc' } },
            bestAnalysis: true,
          },
        },
      },
    })

    const processed = modules.map(m => ({
      ...m,
      addresses: JSON.parse(m.addresses),
      fixes: JSON.parse(m.fixes),
      findings: m.findings.map(f => ({
        ...f,
        findingIds: JSON.parse(f.findingIds),
        affectedFiles: JSON.parse(f.affectedFiles),
      })),
    }))

    // Fetch analyses filtered by project's findings
    const findingIds = modules.flatMap(m => m.findings.map(f => f.id))
    const analyses = await db.bestProposalAnalysis.findMany({
      where: { findingId: { in: findingIds } },
    })

    // Read g3_blocked from AuditConfig instead of hardcoding
    let g3Blocked: Array<{ task: string; title: string; canShipNow: string; needsReview: string }> = []
    try {
      const g3Config = await db.auditConfig.findUnique({
        where: { projectId_key: { projectId: activeId, key: 'g3_blocked' } },
      })
      if (g3Config) {
        try {
          const parsed = JSON.parse(g3Config.value)
          if (Array.isArray(parsed)) {
            g3Blocked = parsed
          }
        } catch {
          // JSON.parse failed — return empty g3Blocked
        }
      }
    } catch {
      // AuditConfig lookup failed — return empty g3Blocked
    }

    return NextResponse.json({ modules: processed, analyses, g3Blocked })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch modules' }, { status: 500 })
  }
}
