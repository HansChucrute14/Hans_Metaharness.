import { db } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { getActiveProjectId } from '@/lib/get-active-project'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { findings, projectId } = body as { findings?: unknown[]; projectId?: string }

    if (!Array.isArray(findings)) {
      return NextResponse.json({ error: 'findings must be an array' }, { status: 400 })
    }

    const activeId = projectId ?? await getActiveProjectId(request)
    if (!activeId) {
      return NextResponse.json({ error: 'No active project found' }, { status: 400 })
    }

    const results = { created: 0, skipped: 0, errors: [] as string[] }

    for (const f of findings) {
      const finding = f as Record<string, unknown>
      try {
        // Check if already exists using composite unique
        const existing = await db.finding.findUnique({
          where: { projectId_task: { projectId: activeId, task: String(finding.task) } },
        })
        if (existing) {
          results.skipped++
          continue
        }

        await db.finding.create({
          data: {
            task: String(finding.task),
            findingIds: JSON.stringify((finding.findingIds as unknown[]) || []),
            title: (finding.title as string) || '',
            tier: (finding.tier as string) || 'tier2',
            severity: (finding.severity as string) || 'medium',
            category: (finding.category as string) || 'Uncategorized',
            summary: (finding.summary as string) || '',
            claim: (finding.claim as string) || '',
            evidence: (finding.evidence as string) || '',
            verificationStatus: (finding.verificationStatus as string) || 'confirmed-execution',
            verificationNote: (finding.verificationNote as string) || null,
            dependsOn: (finding.dependsOn as string) || 'None',
            affectedFiles: JSON.stringify((finding.affectedFiles as unknown[]) || []),
            unifiedModuleId: (finding.unifiedModuleId as string) || null,
            projectId: activeId,
            proposals: {
              create: ((finding.proposals as unknown[]) || []).map((p: unknown, i: number) => {
                const prop = p as Record<string, unknown>
                return {
                  index: i,
                  title: (prop.title as string) || '',
                  description: (prop.description as string) || '',
                  effort: (prop.effort as string) || 'medium',
                  risk: (prop.risk as string) || 'medium',
                  reversible: prop.reversible !== undefined ? Boolean(prop.reversible) : true,
                }
              }),
            },
          },
        })
        results.created++
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error'
        results.errors.push(`Task ${finding.task}: ${message}`)
      }
    }

    return NextResponse.json(results, { status: 201 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to batch import', details: message },
      { status: 500 }
    )
  }
}
